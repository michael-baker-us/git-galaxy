export interface Landing {
  setBusy(message: string): void;
  setError(message: string): void;
  hide(): void;
}

const TOKEN_KEY = "gg:token";
const EXAMPLES = ["expressjs/express", "vitejs/vite", "michael-baker-us"];

/**
 * Static-deployment entry: no local server, so ask which public GitHub repo
 * to render. Touch-first layout — most Pages visitors are on phones.
 */
export function showLanding(
  el: HTMLElement,
  onSubmit: (repoRef: string, token: string | undefined) => void,
): Landing {
  const savedToken = localStorage.getItem(TOKEN_KEY) ?? "";
  el.innerHTML = `
    <div class="card">
      <h1>Git Galaxy 🌌</h1>
      <p>Every repository is a galaxy. Stars are commits, planets are folders,
         satellites are files. Enter a public GitHub repo — or just an owner
         to render their whole universe:</p>
      <form>
        <input name="repo" type="text" placeholder="owner/repo — or just owner" autocapitalize="none"
               autocorrect="off" spellcheck="false" inputmode="text" />
        <button type="submit">launch ✦</button>
      </form>
      <div class="examples">${EXAMPLES.map((e) => `<button data-repo="${e}">${e}</button>`).join("")}</div>
      <details ${savedToken ? "open" : ""}>
        <summary>optional: GitHub token (raises the rate limit 60 → 5,000/hr)</summary>
        <input name="token" type="password" placeholder="ghp_… (stored only in this browser)"
               value="${savedToken}" />
      </details>
      <div class="status"></div>
    </div>
  `;
  el.style.display = "flex";

  const form = el.querySelector("form") as HTMLFormElement;
  const repoInput = el.querySelector<HTMLInputElement>("input[name=repo]") as HTMLInputElement;
  const tokenInput = el.querySelector<HTMLInputElement>("input[name=token]") as HTMLInputElement;
  const status = el.querySelector<HTMLElement>(".status") as HTMLElement;

  const submit = (repoRef: string) => {
    const token = tokenInput.value.trim() || undefined;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    onSubmit(repoRef, token);
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (repoInput.value.trim()) submit(repoInput.value);
  });
  for (const btn of el.querySelectorAll<HTMLButtonElement>(".examples button")) {
    btn.addEventListener("click", () => {
      repoInput.value = btn.dataset.repo ?? "";
      submit(repoInput.value);
    });
  }

  return {
    setBusy(message) {
      status.textContent = message;
      status.classList.remove("error");
    },
    setError(message) {
      status.textContent = message;
      status.classList.add("error");
    },
    hide() {
      el.style.display = "none";
    },
  };
}

export function storedToken(): string | undefined {
  return localStorage.getItem(TOKEN_KEY) ?? undefined;
}
