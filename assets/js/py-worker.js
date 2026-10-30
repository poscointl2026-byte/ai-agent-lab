// Pyodide를 Web Worker에서 실행합니다. 무한 루프가 생겨도 페이지가 멈추지 않고, '중지'로 워커를 종료할 수 있습니다.
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js", "llm.js");

let currentId = null;

const ready = (async () => {
  const py = await loadPyodide();
  const src = await (await fetch("../py/agentlab.py", { cache: "no-cache" })).text();
  py.FS.writeFile("/home/pyodide/agentlab.py", src);
  // 실전 프로젝트용 데이터셋을 data/ 폴더에 올립니다. (pd.read_csv("data/sales.csv")처럼 사용)
  py.FS.mkdirTree("/home/pyodide/data");
  const files = await (await fetch("../data/index.json", { cache: "no-cache" })).json();
  await Promise.all(files.map(async (name) => {
    const buf = await (await fetch("../data/" + name, { cache: "no-cache" })).arrayBuffer();
    py.FS.writeFile("/home/pyodide/data/" + name, new Uint8Array(buf));
  }));
  // 워커에는 DOM이 없으므로 matplotlib은 이미지(Agg) 백엔드를 씁니다.
  py.runPython("import os; os.environ['MPLBACKEND'] = 'AGG'");
  return py;
})();

ready.then(
  () => postMessage({ type: "ready" }),
  (e) => postMessage({ type: "fatal", text: String(e) })
);

// agentlab.show_plot()이 PNG(base64)를 출력창으로 보낼 때 사용합니다.
self._agentlab_image = (b64) => postMessage({ type: "output", id: currentId, stream: "image", text: b64 });

// matplotlib을 처음 쓸 때 한글 글꼴(나눔고딕, assets/fonts)을 등록해 그래프 한글이 깨지지 않게 합니다.
let fontReady = false;
async function ensureKoreanFont(py, src) {
  if (fontReady || !/matplotlib/.test(src)) return;
  fontReady = true;
  try {
    const buf = await (await fetch("../fonts/NanumGothic-Regular.ttf")).arrayBuffer();
    py.FS.mkdirTree("/home/pyodide/fonts");
    py.FS.writeFile("/home/pyodide/fonts/NanumGothic.ttf", new Uint8Array(buf));
    await py.runPythonAsync(`
from matplotlib import font_manager, rcParams
font_manager.fontManager.addfont("/home/pyodide/fonts/NanumGothic.ttf")
rcParams["font.family"] = "NanumGothic"
rcParams["axes.unicode_minus"] = False
`);
  } catch (e) { /* 글꼴이 없어도 그래프는 그려집니다 */ }
}

// Pyodide 내부 프레임을 걸러 사용자 코드 부분만 보여줍니다.
function cleanError(e) {
  const msg = String((e && e.message) || e);
  const lines = msg.split("\n");
  const start = lines.findIndex((l) => l.includes('File "<exec>"'));
  if (start === -1) return msg.trim();
  return ["Traceback (most recent call last):", ...lines.slice(start)].join("\n").trim();
}

self.onmessage = async (event) => {
  const { id, code, test, prelude, settings } = event.data;
  const py = await ready;
  currentId = id;
  self.AGENTLAB_SETTINGS = settings;
  const emit = (stream) => (text) => postMessage({ type: "output", id, stream, text: text + "\n" });
  py.setStdout({ batched: emit("stdout") });
  py.setStderr({ batched: emit("stderr") });

  // import 문을 보고 pandas, numpy, scikit-learn, matplotlib 등을 자동으로 내려받습니다(처음 한 번만 느림).
  try {
    await py.loadPackagesFromImports([prelude, code, test].filter(Boolean).join("\n"), {
      messageCallback: (m) => { if (/^Loading|^Loaded/.test(m)) emit("info")("📦 " + m); },
      errorCallback: emit("stderr"),
    });
  } catch (e) {
    postMessage({ type: "done", id, ok: false, phase: "packages", error: "패키지를 불러오지 못했습니다: " + String(e) });
    return;
  }
  await ensureKoreanFont(py, [prelude, code, test].join("\n"));

  await py.runPythonAsync("import agentlab\nagentlab._reset()");
  const ns = py.globals.get("dict")();
  ns.set("__name__", "__main__");
  const phases = [["prelude", prelude], ["code", code], ["test", test]];
  try {
    for (const [phase, src] of phases) {
      if (!src) continue;
      if (phase !== "prelude") await py.runPythonAsync("import agentlab\nagentlab._reset()");
      try {
        await py.runPythonAsync(src, { globals: ns });
      } catch (e) {
        postMessage({ type: "done", id, ok: false, phase, error: cleanError(e) });
        return;
      }
    }
    postMessage({ type: "done", id, ok: true });
  } finally {
    ns.destroy();
  }
};
