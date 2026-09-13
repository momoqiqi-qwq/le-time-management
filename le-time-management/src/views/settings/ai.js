import { api } from "../../api.js";
import { el, toast } from "../../ui.js";

export async function createAiSettingsCard() {
  const status = await api.aiVaultStatus().catch(() => ({ configured: false, baseUrl: "", model: "", keyMasked: "" }));
  const base = el("input", {
    type: "url",
    value: status.baseUrl || "",
    placeholder: "例如：https://api.openai.com/v1",
    autocomplete: "off",
    spellcheck: "false",
  });
  const model = el("input", {
    type: "text",
    value: status.model || "",
    placeholder: "例如：gpt-4o-mini / qwen-plus / deepseek-chat",
    autocomplete: "off",
    spellcheck: "false",
  });
  const key = el("input", {
    type: "password",
    value: "",
    placeholder: status.configured ? `${status.keyMasked || "已加密保存"}（留空保持不变）` : "API Key",
    autocomplete: "new-password",
    spellcheck: "false",
  });
  const state = el("span", { class: `ai-vault-state${status.configured ? " ok" : ""}` }, status.configured ? "已加密保存" : "未配置");
  const testOut = el("p", { class: "desc ai-test-result" }, "AI 仅获得应用内任务、时间块和收件箱摘要，不提供任何本地文件操作能力。");

  const card = el("div", { class: "card set-card ai-settings-card" },
    el("div", { class: "ai-card-title-row" },
      el("div", {},
        el("h2", {}, "AI 与自动任务"),
        el("p", { class: "desc" }, "配置 OpenAI 兼容接口。Base URL 与 API Key 不写入 data.json，也不会进入普通备份；凭据由 Rust 后端使用随机本地密钥加密保存。"),
      ),
      state,
    ),
    el("div", { class: "ai-settings-grid" },
      el("label", { class: "ai-field" }, el("span", {}, "Base URL"), base),
      el("label", { class: "ai-field" }, el("span", {}, "模型"), model),
      el("label", { class: "ai-field ai-key-field" }, el("span", {}, "API Key"), key),
    ),
    el("div", { class: "data-actions ai-settings-actions" },
      el("button", { class: "btn pri sm", onclick: async () => {
        const old = state.textContent;
        state.textContent = "保存中…";
        try {
          const next = await api.aiVaultSave(base.value.trim(), key.value.trim(), model.value.trim());
          key.value = "";
          key.placeholder = `${next.keyMasked || "已加密保存"}（留空保持不变）`;
          state.textContent = "已加密保存";
          state.classList.add("ok");
          toast("AI 凭据已加密保存");
        } catch (e) {
          state.textContent = old;
          toast(`保存失败：${e.message || e}`);
        }
      } }, "加密保存"),
      el("button", { class: "btn ghost sm", onclick: async () => {
        testOut.textContent = "正在测试 AI 连接…";
        try {
          const reply = await api.aiChat([
            { role: "system", content: "你正在进行连接测试。只回复：连接成功" },
            { role: "user", content: "测试" },
          ], 0);
          testOut.textContent = `连接正常：${String(reply).trim().slice(0, 120)}`;
          toast("AI 连接测试成功");
        } catch (e) {
          testOut.textContent = `连接失败：${e.message || e}`;
          toast("AI 连接测试失败");
        }
      } }, "测试连接"),
      el("button", { class: "btn ghost sm", onclick: async () => {
        if (!confirm("清除已加密保存的 AI Base URL / API Key / 模型配置？")) return;
        await api.aiVaultClear();
        base.value = "";
        model.value = "";
        key.value = "";
        key.placeholder = "API Key";
        state.textContent = "未配置";
        state.classList.remove("ok");
        testOut.textContent = "AI 凭据已清除。";
        toast("AI 凭据已清除");
      } }, "清除凭据"),
    ),
    testOut,
    el("div", { class: "ai-security-note" },
      el("b", {}, "安全边界"),
      el("span", {}, "AI 自动任务只能创建/修改应用内任务、创建时间块、添加收件箱事项；没有读取、写入、删除本地文件或执行系统命令的接口。"),
    ),
  );
  return card;
}
