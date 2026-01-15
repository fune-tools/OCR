importScripts("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");

function findLooseCandidates(text) {
  return text.match(/[A-Za-z0-9][A-Za-z0-9\s-]{8,38}[A-Za-z0-9]/g) || [];
}

function normalizeCandidate(str) {
  return str
    .replace(/\s+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidCode(str) {
  if (/^[A-Za-z0-9]{16}$/.test(str)) return true;
  if (/^[A-Za-z0-9-]{16,17}$/.test(str)) return true;
  return false;
}

function extractAmount(text) {
  const amountPattern = /(\d[\d,，．.\s]{0,10})\s?(円|￥|¥|ポイント|分)/g;
  
  let maxAmount = 0;
  let match;

  while ((match = amountPattern.exec(text)) !== null) {
    const rawNum = match[1].replace(/[^0-9]/g, "");
    if (!rawNum) continue;

    const numericValue = parseInt(rawNum, 10);

    if (numericValue > maxAmount && numericValue < 1000000 && numericValue >= 190) {
      maxAmount = numericValue;
    }
  }

  if (maxAmount === 0) {
    const looseNumbers = text.match(/\b\d{1,3}(?:[，,]\d{3})+\b/g) || [];
    looseNumbers.forEach(n => {
      const val = parseInt(n.replace(/[^0-9]/g, ""), 10);
      if (val > maxAmount && val < 1000000 && val >= 300) maxAmount = val;
    });
  }

  if (maxAmount === 0) return null;

  return "￥" + maxAmount.toLocaleString();
}

function extractCodes(text) {
  const candidates = findLooseCandidates(text);
  const results = [];
  for (const c of candidates) {
    const normalized = normalizeCandidate(c);
    if (isValidCode(normalized)) {
      results.push(normalized);
    }
  }
  return results;
}

function preprocessImage(img, scale = 1.5) {
  const canvas = new OffscreenCanvas(img.width * scale, img.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.filter = "grayscale(100%) contrast(200%) brightness(120%)";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function runOCR(canvas) {
  const blob = await canvas.convertToBlob();
  const { data: { text } } = await Tesseract.recognize(blob, "eng+jpn");
  return text;
}

onmessage = async (e) => {
  const { files, mode } = e.data;
  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    postMessage({ status: "progress", results: `処理中: ${file.name} (${i+1}/${files.length})` });

    try {
      const imgBitmap = await createImageBitmap(file);
      const canvas = preprocessImage(imgBitmap, 1.5);
      const text = await runOCR(canvas);

      if (mode === "full") {
        results.push(`--- ${file.name} ---\n${text.trim()}`);
        continue;
      }

      const codes = extractCodes(text);
      const amount = extractAmount(text);

      results.push({
        file: file.name,
        fileObj: file,
        code: codes.length > 0 ? codes[0] : null,
        amount: amount
      });
    } catch (err) {
      results.push({ file: file.name, code: null, amount: "エラー" });
    }
  }
  postMessage({ status: "done", results });
};
