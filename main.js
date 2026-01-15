let worker = null;
let lastResults = [];
let hyphensRemoved = false;
let originalCompareText = "";

/* -----------------------------
   編集距離（Levenshtein）
----------------------------- */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/* -----------------------------
   類似コード候補（1件だけ返す）
----------------------------- */
function findSimilarCodes(target, compareMap) {
  if (!target || !compareMap) return [];

  const targetClean = target.replace(/-/g, "");
  const candidates = [];

  for (const [code] of compareMap.entries()) {
    const clean = code.replace(/-/g, "");
    const dist = levenshtein(targetClean, clean);
    candidates.push({ code, dist });
  }

  candidates.sort((a, b) => a.dist - b.dist);

  return candidates.slice(0, 1); // ← 1件だけ
}

/* -----------------------------
   Worker 初期化
----------------------------- */
function initWorker() {
  if (worker) worker.terminate();
  worker = new Worker("worker.js");

  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");
  const copyOnlyCodeBtn = document.getElementById("copyOnlyCodeBtn");
  const copyCodeAmountBtn = document.getElementById("copyCodeAmountBtn");

  worker.onmessage = (e) => {
    const { status, results } = e.data;

    if (status === "progress") {
      statusEl.textContent = results;
      return;
    }

    if (status === "done") {
      statusEl.textContent = "完了しました。結果をクリックするとコードをコピーできます。";
      resultsEl.innerHTML = "";
      lastResults = results;

      const isCodeMode = results.length > 0 && typeof results[0] === "object";
      copyOnlyCodeBtn.disabled = !isCodeMode;
      copyCodeAmountBtn.disabled = !isCodeMode;

      const compareText = document.getElementById("compareInput").value.trim();
      const compareMap = compareText ? parseCompareInput(compareText) : null;

      results.forEach((item) => {
        if (isCodeMode) {
          resultsEl.appendChild(renderCodeResult(item, compareMap));
        } else {
          const div = document.createElement("div");
          div.className = "result-item";
          div.textContent = item;
          div.onclick = () => navigator.clipboard.writeText(item);
          resultsEl.appendChild(div);
        }
      });
    }
  };
}

/* -----------------------------
   比較欄のパース
----------------------------- */
function parseCompareInput(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const map = new Map();

  for (const line of lines) {
    const parts = line.split(/\s+/);
    const code = parts[0];
    const amount = parts[1] ? parts[1].replace(/[^0-9]/g, "") : null;
    map.set(code, amount);
  }
  return map;
}

/* -----------------------------
   結果1件の描画
----------------------------- */
function renderCodeResult(item, compareMap) {
  const container = document.createElement("div");
  container.className = "result-item";

  let mark = "";
  let color = "";
  let fontWeight = "normal";
  let comment = "";

  if (compareMap) {
    if (compareMap.has(item.code)) {
      const expectedAmount = compareMap.get(item.code);
      const actualAmount = item.amount ? item.amount.replace(/[^0-9]/g, "") : null;

      if (expectedAmount && actualAmount && expectedAmount === actualAmount) {
        mark = "◎";
        color = "green";
        fontWeight = "bold";
      } else {
        mark = "△";
        color = "orange";
        comment = "金額が違うみたい…アタシの読み取りミスならゴメン(-_-;)";
      }
    } else {
      mark = "！";
      color = "red";
      fontWeight = "bold";
      comment = "コードが違うな…アタシの読み取りミスならゴメン(-_-;)";
    }
  }

  const amountText = item.amount ? `【${item.amount}】` : "(金額不明)";
  const digits = item.code ? item.code.replace(/-/g, "").length : 0;

  container.textContent = `${mark} ${item.code || "読み取れず"}（${digits}桁） ${amountText} - `;

  /* -----------------------------
     ファイル名クリック → 左上に小窓
  ----------------------------- */
  if (item.fileObj) {
    const url = URL.createObjectURL(item.fileObj);

    const link = document.createElement("span");
    link.textContent = item.file;
    link.style.marginLeft = "6px";
    link.style.textDecoration = "underline";
    link.style.color = "#06c";
    link.style.cursor = "pointer";

link.onclick = (e) => {
  e.stopPropagation();

  const w = 400;   // 小窓の横幅（3:2 の 6:4 比率）
  const h = 600;   // 小窓の高さ

  const newWin = window.open(
    "",
    "_blank",
    `width=${w},height=${h},left=0,top=0,resizable=yes,scrollbars=yes`
  );

  const url = URL.createObjectURL(item.fileObj);

  newWin.document.write(`
    <html>
      <body style="margin:0; background:#222; color:white; font-family:sans-serif;">
        <div style="padding:8px; font-size:14px; background:#000;">
          ${item.file}
        </div>
        <div style="text-align:center; padding:10px;">
          <img id="previewImg" src="${url}" 
               style="width:50%; height:auto; border:1px solid #444; cursor:pointer;">
          <div style="font-size:12px; color:#ccc; margin-top:4px;">
            画像をクリックすると拡大／縮小できるよ
          </div>
        </div>
        <script>
          (function() {
            var img = document.getElementById('previewImg');
            var zoomed = false;
            img.addEventListener('click', function() {
              if (!zoomed) {
                img.style.width = '100%';
                zoomed = true;
              } else {
                img.style.width = '50%';
                zoomed = false;
              }
            });
          })();
        </script>
      </body>
    </html>
  `);
};

    container.appendChild(link);
  }

  /* -----------------------------
     コメント表示
  ----------------------------- */
  if (comment) {
    const c = document.createElement("div");
    c.style.fontSize = "12px";
    c.style.marginTop = "4px";
    c.style.color = color;
    c.textContent = comment;
    container.appendChild(c);
  }

  /* -----------------------------
     類似候補（1件だけ）
  ----------------------------- */
  if (mark === "！" && compareMap) {
    const similar = findSimilarCodes(item.code, compareMap);

    if (similar.length > 0) {
      const wrap = document.createElement("div");
      wrap.style.fontSize = "12px";
      wrap.style.marginTop = "4px";
      wrap.style.color = "#444";
      wrap.textContent = "入力してくれたのはこれが近いけど・・・";

      const line = document.createElement("div");
      line.textContent = `・${similar[0].code}`;
      wrap.appendChild(line);

      container.appendChild(wrap);
    }
  }

  container.style.color = color;
  container.style.fontWeight = fontWeight;

  container.onclick = () => navigator.clipboard.writeText(item.code || "");

  return container;
}

/* -----------------------------
   DOMContentLoaded
----------------------------- */
window.addEventListener("DOMContentLoaded", () => {
  initWorker();

  const fileInput = document.getElementById("fileInput");
  const runBtn = document.getElementById("runBtn");
  const copyOnlyCodeBtn = document.getElementById("copyOnlyCodeBtn");
  const copyCodeAmountBtn = document.getElementById("copyCodeAmountBtn");
  const toggleHyphensBtn = document.getElementById("toggleHyphensBtn");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");

  runBtn.onclick = () => {
    const files = Array.from(fileInput.files || []);
    if (files.length === 0) {
      statusEl.textContent = "画像ファイルを選択してね。";
      return;
    }

    const mode = document.querySelector('input[name="mode"]:checked').value;
    statusEl.textContent = "処理を開始しました…";
    resultsEl.innerHTML = "";
    copyOnlyCodeBtn.disabled = true;
    copyCodeAmountBtn.disabled = true;

    worker.postMessage({ files, mode });
  };

  /* -----------------------------
     ハイフン削除トグル
  ----------------------------- */
  toggleHyphensBtn.onclick = () => {
    const textarea = document.getElementById("compareInput");

    if (!hyphensRemoved) {
      originalCompareText = textarea.value;

      const lines = textarea.value.split(/\r?\n/);
      const newLines = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length === 0) return "";
        const code = parts[0].replace(/-/g, "");
        const amount = parts[1] || "";
        return amount ? `${code} ${amount}` : code;
      });

      textarea.value = newLines.join("\n");
      toggleHyphensBtn.textContent = "ハイフンを戻す";
      hyphensRemoved = true;

    } else {
      textarea.value = originalCompareText;
      toggleHyphensBtn.textContent = "ハイフンを消す";
      hyphensRemoved = false;
    }
  };

  copyOnlyCodeBtn.onclick = () => {
    const text = lastResults
      .filter(r => r.code)
      .map(r => r.code)
      .join("\n");
    navigator.clipboard.writeText(text || "");
    statusEl.textContent = "コードのみ一括コピーしました。";
  };

  copyCodeAmountBtn.onclick = () => {
    const text = lastResults
      .map(r => {
        const code = r.code || "不明";
        const amountNum = r.amount ? r.amount.replace(/[^0-9]/g, "") : "不明";
        return `${code} ${amountNum}`;
      })
      .join("\n");
    navigator.clipboard.writeText(text || "");
    statusEl.textContent = "コードと金額を一括コピーしました。";
  };
});
