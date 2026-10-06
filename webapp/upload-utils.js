// ==========================================================================
// UploadUtils — compressão de uploads no navegador (global `UploadUtils`).
//
// Script clássico, sem build. Toda imagem nova vira WebP (fallback JPEG se o
// navegador não gerar WebP) e todo PDF novo passa por recompressão das
// imagens embutidas (pdf-lib, carregado sob demanda do cdnjs). Só uploads
// novos: nada aqui reprocessa registros já gravados.
//
// API:
//   UploadUtils.PRESETS                         presets de imagem
//   UploadUtils.sniffType(blobOuBytes)          -> Promise<'image/jpeg'|'image/png'|'image/webp'|'image/gif'|'application/pdf'|null>
//   UploadUtils.compressImage(file, preset)     -> Promise<{blob, mime, ext, compressed}>
//   UploadUtils.compressPdf(file)               -> Promise<{blob, mime:'application/pdf', ext:'pdf', compressed}>
//   UploadUtils.prepareUpload(file, preset)     -> roteia pelo tipo REAL (bytes), nunca só file.type
//   UploadUtils.prepareUploadDataUrl(file, preset) -> Promise<{dataUrl, blob, mime, ext, compressed}>
//   UploadUtils.canvasToDataUrl(canvas, q)      -> data URL WebP (JPEG se WebP indisponível)
//   UploadUtils.blobToDataUrl(blob)
//
// O servidor revalida tudo (config/data-url.js): nunca confie só no cliente.
// ==========================================================================
(function (global) {
  'use strict';

  // lado maior em px (sem upscale) e qualidade do encoder.
  var PRESETS = {
    // Comprovantes/envelopes/documentos: texto precisa continuar legível.
    documento: { maxSide: 2200, quality: 0.85 },
    foto: { maxSide: 1600, quality: 0.82 },
    avatar: { maxSide: 512, quality: 0.82 },
    // Selfie de ponto/biometria: mantém a resolução de captura (o recorte já
    // é feito em 480px de largura, que é o que o face-api usa).
    selfie: { maxSide: null, quality: 0.85 }
  };

  // Versão FIXADA do pdf-lib + SRI (cdnjs). Não usar "latest".
  var PDF_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  var PDF_LIB_SRI = 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI';

  var PDF_MIN_GANHO = 0.15;      // só troca o PDF se ficar >=15% menor
  var PDF_MAX_DPI = 200;         // teto de dpi efetivo das imagens embutidas
  var PDF_JPEG_QUALITY = 0.8;

  // -------------------------------------------------------------------------
  // Utilidades puras (testáveis em Node)
  // -------------------------------------------------------------------------

  // Detecta o tipo pelos magic bytes. Aceita Uint8Array/ArrayBuffer.
  function sniffBytes(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
    if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf';
    return null;
  }

  // Dimensões finais mantendo proporção, sem upscale. maxSide null = não reduz.
  function fitDimensions(w, h, maxSide) {
    if (!maxSide || Math.max(w, h) <= maxSide) return { width: w, height: h };
    var s = maxSide / Math.max(w, h);
    return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
  }

  var EXT_POR_MIME = {
    'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'application/pdf': 'pdf'
  };

  function extDe(mime) { return EXT_POR_MIME[mime] || 'bin'; }

  function sniffType(blobOuBytes) {
    if (blobOuBytes && typeof blobOuBytes.slice === 'function' && typeof blobOuBytes.arrayBuffer === 'function') {
      return blobOuBytes.slice(0, 16).arrayBuffer().then(sniffBytes);
    }
    return Promise.resolve(sniffBytes(blobOuBytes));
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  function canvasToBlob(canvas, mime, q) {
    return new Promise(function (resolve) {
      try { canvas.toBlob(function (b) { resolve(b); }, mime, q); } catch (e) { resolve(null); }
    });
  }

  // Síncrono: para capturas de câmera. Se o navegador não gera WebP,
  // toDataURL devolve PNG — nesse caso cai para JPEG.
  function canvasToDataUrl(canvas, q) {
    var quality = q == null ? 0.85 : q;
    var url = canvas.toDataURL('image/webp', quality);
    if (url.indexOf('data:image/webp') === 0) return url;
    return canvas.toDataURL('image/jpeg', quality);
  }

  function resultadoOriginal(file, mime) {
    var m = mime || file.type || 'application/octet-stream';
    return { blob: file, mime: m, ext: extDe(m), compressed: false };
  }

  // -------------------------------------------------------------------------
  // Imagens
  // -------------------------------------------------------------------------

  function decodificarImagem(blob) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(function () {
        // Navegadores sem a opção (Safari antigo): decodifica sem ela.
        return createImageBitmap(blob);
      });
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
      img.src = url;
    });
  }

  async function compressImage(file, presetNome) {
    var preset = PRESETS[presetNome || 'documento'] || PRESETS.documento;
    var tipoReal = await sniffType(file);
    // GIF, SVG, HEIC etc. passam intactos (não processamos o que não sabemos
    // reencodar sem perda de função).
    if (tipoReal !== 'image/jpeg' && tipoReal !== 'image/png' && tipoReal !== 'image/webp') {
      return resultadoOriginal(file, tipoReal || file.type);
    }
    try {
      var bitmap = await decodificarImagem(file);
      var w = bitmap.width || bitmap.naturalWidth;
      var h = bitmap.height || bitmap.naturalHeight;
      var dim = fitDimensions(w, h, preset.maxSide);
      var canvas = document.createElement('canvas');
      canvas.width = dim.width;
      canvas.height = dim.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, dim.width, dim.height); // WebP preserva alpha
      if (bitmap.close) bitmap.close();

      var blob = await canvasToBlob(canvas, 'image/webp', preset.quality);
      if (!blob || blob.type !== 'image/webp') {
        // Sem encoder WebP: JPEG (não tem alpha -> fundo branco).
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, dim.width, dim.height);
        blob = await canvasToBlob(canvas, 'image/jpeg', preset.quality);
      }
      if (!blob) return resultadoOriginal(file, tipoReal);

      // Não piorar: se ficou maior e o original já é WebP/JPEG, mantém o original.
      if (blob.size >= file.size && (tipoReal === 'image/webp' || tipoReal === 'image/jpeg')) {
        return resultadoOriginal(file, tipoReal);
      }
      var mime = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      return { blob: blob, mime: mime, ext: extDe(mime), compressed: true };
    } catch (e) {
      console.warn('UploadUtils.compressImage: falha, enviando original.', e);
      return resultadoOriginal(file, tipoReal);
    }
  }

  // -------------------------------------------------------------------------
  // PDF
  // -------------------------------------------------------------------------

  var _pdfLibPromise = null;
  function carregarPdfLib() {
    if (global.PDFLib) return Promise.resolve(global.PDFLib);
    if (!_pdfLibPromise) {
      _pdfLibPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = PDF_LIB_URL;
        s.integrity = PDF_LIB_SRI;
        s.crossOrigin = 'anonymous';
        s.onload = function () { global.PDFLib ? resolve(global.PDFLib) : reject(new Error('pdf-lib indisponível')); };
        s.onerror = function () { _pdfLibPromise = null; reject(new Error('Falha ao carregar pdf-lib')); };
        document.head.appendChild(s);
      });
    }
    return _pdfLibPromise;
  }

  function cederThread() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // PDF assinado digitalmente: qualquer reescrita invalida a assinatura.
  function pareceAssinado(bytes) {
    var txt = '';
    var CH = 1 << 20;
    for (var i = 0; i < bytes.length; i += CH) {
      txt += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length)));
    }
    return /\/ByteRange\s*\[/.test(txt) || /\/Type\s*\/Sig\b/.test(txt) || /\/SigFlags\s+[1-3]\b/.test(txt) || /\/Encrypt\b/.test(txt);
  }

  // Tamanho de página (pt) em que cada XObject de imagem aparece.
  function mapearPaginasPorImagem(PDFLib, pdfDoc) {
    var mapa = new Map();
    var N = PDFLib.PDFName.of;
    pdfDoc.getPages().forEach(function (page) {
      var size = page.getSize();
      var res = page.node.Resources && page.node.Resources();
      if (!res) return;
      var xo = res.lookupMaybe(N('XObject'), PDFLib.PDFDict);
      if (!xo) return;
      xo.entries().forEach(function (par) {
        var ref = par[1];
        if (ref instanceof PDFLib.PDFRef) {
          var atual = mapa.get(ref.toString());
          if (!atual || size.width > atual.width) mapa.set(ref.toString(), { width: size.width, height: size.height });
        }
      });
    });
    return mapa;
  }

  function numero(PDFLib, dict, chave) {
    var v = dict.lookup(PDFLib.PDFName.of(chave));
    return v && typeof v.asNumber === 'function' ? v.asNumber() : null;
  }

  function nomeDe(PDFLib, v) {
    return v && v instanceof PDFLib.PDFName ? v.decodeText() : null;
  }

  function filtroDe(PDFLib, dict) {
    var f = dict.lookup(PDFLib.PDFName.of('Filter'));
    if (f instanceof PDFLib.PDFName) return f.decodeText();
    if (f instanceof PDFLib.PDFArray && f.size() === 1) return nomeDe(PDFLib, f.lookup(0));
    return null; // múltiplos filtros: não mexemos
  }

  // Decodifica a imagem do stream para um canvas. null se não suportada.
  async function imagemParaCanvas(PDFLib, stream, filtro, w, h, espaco) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (filtro === 'DCTDecode') {
      var bmp = await createImageBitmap(new Blob([stream.getContents()], { type: 'image/jpeg' }));
      ctx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return canvas;
    }
    if (filtro === 'FlateDecode') {
      var raw = PDFLib.decodePDFRawStream(stream).decode();
      var canais = espaco === 'DeviceRGB' ? 3 : 1;
      if (raw.length < w * h * canais) return null;
      var img = ctx.createImageData(w, h);
      for (var i = 0, p = 0, q = 0; i < w * h; i++, q += 4) {
        if (canais === 3) { img.data[q] = raw[p++]; img.data[q + 1] = raw[p++]; img.data[q + 2] = raw[p++]; }
        else { var g = raw[p++]; img.data[q] = g; img.data[q + 1] = g; img.data[q + 2] = g; }
        img.data[q + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    }
    return null;
  }

  // Devolve os bytes recomprimidos, ou null para manter o original.
  async function recomprimirPdfBytes(bytes) {
    if (pareceAssinado(bytes)) return null;
    var PDFLib = await carregarPdfLib();
    var pdfDoc;
    try {
      pdfDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    } catch (e) {
      return null; // criptografado/corrompido: intacto
    }
    var N = PDFLib.PDFName.of;
    var paginas = mapearPaginasPorImagem(PDFLib, pdfDoc);
    var ctxPdf = pdfDoc.context;
    var alterou = false;

    var objetos = ctxPdf.enumerateIndirectObjects();
    for (var k = 0; k < objetos.length; k++) {
      var ref = objetos[k][0];
      var obj = objetos[k][1];
      if (!(obj instanceof PDFLib.PDFRawStream)) continue;
      var dict = obj.dict;
      if (nomeDe(PDFLib, dict.lookup(N('Subtype'))) !== 'Image') continue;
      if (dict.has(N('Mask')) || dict.has(N('Decode'))) continue;
      var imageMask = dict.lookup(N('ImageMask'));
      if (imageMask && imageMask.toString() === 'true') continue;
      var bpc = numero(PDFLib, dict, 'BitsPerComponent');
      var espaco = nomeDe(PDFLib, dict.lookup(N('ColorSpace')));
      var filtro = filtroDe(PDFLib, dict);
      var w = numero(PDFLib, dict, 'Width');
      var h = numero(PDFLib, dict, 'Height');
      if (!w || !h || bpc !== 8) continue;
      if (espaco !== 'DeviceRGB' && espaco !== 'DeviceGray') continue;
      if (filtro !== 'DCTDecode' && filtro !== 'FlateDecode') continue;

      var pg = paginas.get(ref.toString());
      if (!pg) continue; // imagem fora de uma página direta: não arriscamos
      var dpi = Math.max(w / (pg.width / 72), h / (pg.height / 72));
      var escala = dpi > PDF_MAX_DPI ? PDF_MAX_DPI / dpi : 1;
      var nw = Math.max(1, Math.round(w * escala));
      var nh = Math.max(1, Math.round(h * escala));

      try {
        var origem = await imagemParaCanvas(PDFLib, obj, filtro, w, h, espaco);
        if (!origem) continue;
        var destino = origem;
        if (nw !== w || nh !== h) {
          destino = document.createElement('canvas');
          destino.width = nw;
          destino.height = nh;
          destino.getContext('2d').drawImage(origem, 0, 0, nw, nh);
        }
        var jpeg = await canvasToBlob(destino, 'image/jpeg', PDF_JPEG_QUALITY);
        if (!jpeg) continue;
        var novos = new Uint8Array(await jpeg.arrayBuffer());
        // Só vale trocar se essa imagem encolher de forma relevante.
        if (novos.length >= obj.getContentsSize() * 0.9) continue;

        var novoDict = {
          Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh,
          ColorSpace: espaco, BitsPerComponent: 8, Filter: 'DCTDecode'
        };
        var novo = ctxPdf.stream(novos, novoDict);
        var smask = dict.get(N('SMask'));
        if (smask) novo.dict.set(N('SMask'), smask);
        ctxPdf.assign(ref, novo);
        alterou = true;
      } catch (e) {
        // Imagem problemática: mantém a original.
      }
      await cederThread(); // não trava a UI em PDFs com muitas imagens
    }

    if (!alterou) return null;
    return await pdfDoc.save({ useObjectStreams: true });
  }

  async function compressPdf(file) {
    var original = resultadoOriginal(file, 'application/pdf');
    try {
      var bytes = new Uint8Array(await file.arrayBuffer());
      if (sniffBytes(bytes) !== 'application/pdf') return original;
      var novos = await recomprimirPdfBytes(bytes);
      if (!novos) return original;
      if (novos.length > bytes.length * (1 - PDF_MIN_GANHO)) return original; // ganho < 15%
      return {
        blob: new Blob([novos], { type: 'application/pdf' }),
        mime: 'application/pdf', ext: 'pdf', compressed: true
      };
    } catch (e) {
      console.warn('UploadUtils.compressPdf: falha, enviando original.', e);
      return original;
    }
  }

  // -------------------------------------------------------------------------
  // Roteador
  // -------------------------------------------------------------------------

  async function prepareUpload(file, preset) {
    var tipo = await sniffType(file);
    if (tipo === 'application/pdf') return compressPdf(file);
    if (tipo === 'image/jpeg' || tipo === 'image/png' || tipo === 'image/webp') return compressImage(file, preset);
    return resultadoOriginal(file, tipo || file.type);
  }

  async function prepareUploadDataUrl(file, preset) {
    var r = await prepareUpload(file, preset);
    r.dataUrl = await blobToDataUrl(r.blob);
    return r;
  }

  var UploadUtils = {
    PRESETS: PRESETS,
    sniffType: sniffType,
    sniffBytes: sniffBytes,
    fitDimensions: fitDimensions,
    extDe: extDe,
    compressImage: compressImage,
    compressPdf: compressPdf,
    prepareUpload: prepareUpload,
    prepareUploadDataUrl: prepareUploadDataUrl,
    canvasToDataUrl: canvasToDataUrl,
    blobToDataUrl: blobToDataUrl
  };

  global.UploadUtils = UploadUtils;
  if (typeof module !== 'undefined' && module.exports) module.exports = UploadUtils;
})(typeof window !== 'undefined' ? window : globalThis);
