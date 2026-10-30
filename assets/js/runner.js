// 메인 스레드 쪽 Python 실행기: py-worker.js를 관리하고 실행 요청을 한 번에 하나씩 보냅니다.
(function (global) {
  "use strict";

  let worker = null;
  let readyPromise = null;
  let current = null; // { id, onOutput, resolve }
  let seq = 0;
  const statusListeners = new Set();

  function setStatus(status) {
    statusListeners.forEach((fn) => fn(status));
  }

  function start() {
    worker = new Worker("assets/js/py-worker.js");
    setStatus("loading");
    readyPromise = new Promise((resolve, reject) => {
      worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === "ready") {
          setStatus("ready");
          resolve();
        } else if (msg.type === "fatal") {
          setStatus("error");
          reject(new Error(msg.text));
        } else if (current && msg.id === current.id) {
          if (msg.type === "output") current.onOutput(msg.text, msg.stream);
          if (msg.type === "done") {
            const done = current;
            current = null;
            setStatus("ready");
            done.resolve(msg);
          }
        }
      };
      worker.onerror = (e) => {
        setStatus("error");
        reject(new Error(e.message || "Python 워커를 시작하지 못했습니다."));
      };
    });
  }

  function ensure() {
    if (!worker) start();
    return readyPromise;
  }

  // prelude: 사용자 코드보다 먼저 같은 네임스페이스에서 실행할 코드 (프로젝트의 이전 단계 정답)
  async function run(code, { test = null, prelude = null, onOutput = () => {} } = {}) {
    if (current) return { ok: false, error: "이미 다른 코드가 실행 중입니다. 끝나면 다시 시도하세요." };
    await ensure();
    const id = ++seq;
    setStatus("running");
    return new Promise((resolve) => {
      current = { id, onOutput, resolve };
      worker.postMessage({ id, code, test, prelude, settings: global.AgentLabLLM.loadSettings() });
    });
  }

  // 실행 중인 코드를 강제로 멈춥니다. 워커를 종료하고 새로 시작하므로 다시 로딩됩니다.
  function stop() {
    if (!worker) return;
    worker.terminate();
    worker = null;
    if (current) {
      const done = current;
      current = null;
      done.resolve({ ok: false, stopped: true, error: "사용자가 실행을 중지했습니다." });
    }
    start();
  }

  global.PyRunner = {
    run,
    stop,
    preload: ensure,
    isRunning: () => current !== null,
    onStatus: (fn) => statusListeners.add(fn),
  };
})(window);
