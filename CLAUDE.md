# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

qwen2API 是一个把 `chat.qwen.ai` 网页能力转换成 OpenAI / Anthropic Messages / Gemini GenerateContent 三套兼容协议的网关。后端用 FastAPI + httpx 异步实现，前端是 React 19 + Vite + Tailwind 的管理台。`AGENTS.md` 与 `README.md` 已经记录了部署、变量与协议层面的细节，本文件只补充 Claude Code 在代码上下文中容易踩坑的信息。

## 常用命令

- `python start.py` — 一键启动：安装后端依赖、按需下载 Camoufox 浏览器内核（仅注册账号时用）、启动 Uvicorn (127.0.0.1:7860) 与 Vite (127.0.0.1:5174)。会自动 `kill` 占用 7860 的旧进程。
- `python -m uvicorn backend.main:app --host 0.0.0.0 --port 7860 --workers 1` — 只起后端。注意 `WORKERS` 必须保持 `1`：多 worker 会让本地 JSON 数据库出现并发写冲突。
- `cd backend && python -m pip install -r requirements.txt` — 后端运行时依赖。`requirements-dev.txt` 额外引入 `pytest`。
- `cd backend && python -m pytest` — 运行后端 pytest 套件（`backend/tests/`）。**`test_protocol_regression.py` 是关键回归测试**，它锁死了 `backend/services/*`、`backend/upstream/*`、`backend/adapter/*` 等旧路径必须等价于新位置的 re-export（见下文「兼容层」）。
- `cd backend && python -m pytest backend/tests/test_protocol_regression.py::test_openai_standard_request_preserves_model_stream_and_tools -q` — 单测示例。
- `cd frontend && npm install && npm run dev` — 仅启前端 dev server（5174）。Vite 配置已经把 `/api`、`/v1`、`/anthropic`、`/v1beta` 反代到 7860。
- `cd frontend && npm run lint` / `npm run build` — ESLint + 生产构建。`npm run build` 把产物输出到 `frontend/dist/`，FastAPI 的 `app_factory._mount_frontend` 会自动挂载它到 `/`。
- `docker compose up -d` — 用预构建镜像（`yujunzhixue/qwen2api:latest`）运行，需要保留 `./data` 与 `./logs` 挂载。

## 整体架构

请求流（以 OpenAI Chat 为例）：

```
HTTP /v1/chat/completions
 → backend/api/v1_chat.py
 → resolve_auth_context        (services/auth_quota.py: ADMIN_KEY / API_KEYS / users.json)
 → preprocess_attachments      (services/attachment_preprocessor.py: data: URL 与 file_id 标准化)
 → prepare_context_attachments (services/context_attachment_manager.py: 上下文文件落盘/上行)
 → build_chat_standard_request (application/completions/request_builder.py: → StandardRequest)
 → plan_persistent_session_turn(services/task_session.py: 会话级 chat_id 复用计划)
 → run_retryable_completion_bridge (application/completions/bridge.py)
     → collect_completion_run    (runtime/runner.py: 串流读取 SSE，提取工具调用)
         → QwenExecutor.chat_stream_events_with_retry (integrations/qwen/executor.py)
             → AccountPool.acquire_wait (core/account_pool/: 4 层并发控制)
             → QwenClient.stream_chat_once (integrations/qwen/client.py: httpx HTTP/2 长连接池)
     → evaluate_retry_directive (runtime/retry.py: 工具契约失败/空响应/拒绝时重排 prompt 重试)
     → cleanup_runtime_resources (runtime/cleanup.py: 释放账号、按需删除 chat)
 → OpenAIStreamTranslator       (protocols/openai/stream_translator.py)
   或 build_openai_completion_payload (protocols/openai/response_formatters.py)
 → persist_session_turn         (services/task_session.py: 写回会话历史哈希)
```

Anthropic (`api/anthropic.py`) 与 Gemini (`api/gemini.py`) 共享同一条 runtime 链路，区别只在入口的 `CLIProxy.from_anthropic` / `from_gemini` 转换与出口的流式格式化（`runtime/anthropic_stream.py` 等）。

### 模块边界

- `backend/api/` — FastAPI router；只做参数解析、鉴权、组装 `StandardRequest`、流式编排，不写业务策略。
- `backend/protocols/` — 协议层。`common/cli_proxy.py` 把三协议入口转成 `StandardRequest`；`openai/`、`anthropic/`、`gemini/` 各放出方向的流/非流格式化。
- `backend/application/completions/` — 业务桥。`request_builder.build_chat_standard_request` 构造请求、`prompt_builder.messages_to_prompt` 渲染最终 prompt（含 schema 压缩、工具混淆、refusal 清洗、话题隔离等）、`bridge.run_retryable_completion_bridge` 是「带重试的一次 completion」。
- `backend/runtime/` — 单次 attempt 的执行/解析/重试/恢复。`runner.collect_completion_run` 是流式收集器，`retry.evaluate_retry_directive` 决定是否换 prompt 再来一次，`tool_directive.build_tool_directive` 把 native tool_calls 与文本 `##TOOL_CALL##` 标记合并成统一 `RuntimeToolDirective`。`execution.py` 仅是把上述子模块再导出一遍的聚合文件，新代码应直接 import 子模块。
- `backend/integrations/qwen/` — 真正与 chat.qwen.ai 通信的层：`auth.py`（含 Camoufox 浏览器注册/激活）、`client.py`（httpx HTTP/2 池）、`executor.py`（账号选择、chat 创建/复用、重试与限流标记）、`payload_builder.py`、`sse_consumer.py`、`file_uploader.py`。
- `backend/core/` — 基础设施：`config.py`（pydantic-settings + MODEL_MAP + API_KEYS 内存集合）、`account_pool/`（`pool_core.Account` + `pool_acquire`，4 层并发：每账号 inflight / 推荐并发 / 等待队列 / 全局 inflight）、`database.py`（`AsyncJsonDB` 与 `AsyncMongoDB` 抽象同接口，由 `MONGODB_URI` 决定使用哪一种）、`session_affinity.py`、`session_lock.py`、`upstream_file_cache.py`、`tool_cache.py`、`request_logging.py`（contextvar 注入 req_id/surface/upstream_attempt 等）。
- `backend/services/` — 进程内可重用业务服务。注意此目录里**很多文件已经退化为兼容性 re-export**（见下节），但仍有「真业务」服务：`task_session.py`（会话哈希/复用计划）、`attachment_preprocessor.py`、`context_attachment_manager.py`、`tool_parser.py`、`refusal_cleaner.py`、`schema_compressor.py`、`tool_name_obfuscation.py`、`tool_few_shot.py`、`topic_isolation.py`、`incremental_text_streamer.py`、`chat_id_pool.py`、`file_store.py`（本地 vs GridFS）。
- `backend/toolcall/` — 与协议无关的工具调用解析：`parser.py`/`formats_json.py`/`formats_xml.py`/`normalize.py`/`stream_state.py`。
- `backend/adapter/` — 兼容层，详见下节。

### 兼容层（务必先看，再改 services/）

`ab5f505` 重构把"协议层 / 应用层 / 集成层 / 运行时"拆开后，下面的文件被故意保留为薄薄的 re-export，**`backend/tests/test_protocol_regression.py::test_*_legacy_paths_reexport_new_modules` 会断言它们的 identity**：

| 旧路径 | 真正实现 |
|---|---|
| `backend/adapter/cli_proxy.CLIProxy` | `backend/protocols/common/cli_proxy.CLIProxy` |
| `backend/adapter/standard_request.StandardRequest` / `CLAUDE_CODE_OPENAI_PROFILE` / `OPENCLAW_OPENAI_PROFILE` | `backend/protocols/common/standard_request.*` |
| `backend/services/qwen_client.QwenClient` | `backend/integrations/qwen/client.QwenClient` |
| `backend/services/auth_resolver.AuthResolver` | `backend/integrations/qwen/auth.AuthResolver` |
| `backend/services/upstream_file_uploader.UpstreamFileUploader` | `backend/integrations/qwen/file_uploader.UpstreamFileUploader` |
| `backend/services/completion_bridge.*` | `backend/application/completions/bridge.*` |
| `backend/services/prompt_builder.*` | `backend/application/completions/prompt_builder.*` |
| `backend/services/standard_request_builder.build_chat_standard_request` | `backend/application/completions/request_builder.build_chat_standard_request` |
| `backend/services/openai_stream_translator.OpenAIStreamTranslator` | `backend/protocols/openai/stream_translator.OpenAIStreamTranslator` |
| `backend/services/response_formatters.*` | `backend/protocols/openai/response_formatters.*` |
| `backend/upstream/qwen_executor.QwenExecutor` | `backend/integrations/qwen/executor.QwenExecutor` |
| `backend/upstream/payload_builder.build_chat_payload` | `backend/integrations/qwen/payload_builder.build_chat_payload` |
| `backend/upstream/sse_consumer.parse_sse_chunk` | `backend/integrations/qwen/sse_consumer.parse_sse_chunk` |
| `backend/runtime/execution.*` | 聚合自 `runtime/{attempt,anthropic_stream,cleanup,recovery,retry,runner,tool_directive,types,usage}.py` |

新代码请 import 真实位置；改 bug 也改真实位置。不要把 re-export 文件当成扩展点写新逻辑——回归测试会因 identity 不匹配而失败。

### 启动生命周期

`backend/app_factory.create_app()` 注册 `application/container.application_lifespan`：

1. `_connect_mongo_if_configured` — 有 `MONGODB_URI` 就 ping，并把 API Key 存储切换为 `MongoApiKeyStore`；否则用 `LocalApiKeyStore(data/api_keys.json)`。**配了 Mongo 但连不上会直接报错，不会静默退回本地**。
2. `_attach_datastores` — 给 `app.state` 挂上 `accounts_db / users_db / captures_db / session_affinity_db / context_cache_db / uploaded_files_db`，每个都是 `AsyncJsonDB | AsyncMongoDB` 同协议。
3. `_attach_services` — 实例化 `AccountPool`、`QwenClient`、`file_store`（本地或 GridFS）、`SessionAffinityStore`、`UpstreamFileCache`、`ContextOffloader`、`UpstreamFileUploader`、`SessionLockRegistry`。
4. `_load_services` — 把上面这些异步 `.load()` 一遍。
5. `_start_background_tasks` — 启动 `garbage_collect_chats`、`context_cleanup_loop`，以及 `ChatIdPool`（预建 chat 缓冲池，默认每账号 5 个、TTL 600s）。`QwenExecutor.chat_id_pool` 在这一步被注入；没有这个池时 `create_chat` 会同步建。

API handler 通过 `request.app.state.<x>` 拿这些服务，不要再各自单例。

### 协议转换约定

- 所有协议入口必须先经过 `CLIProxy.from_openai/from_anthropic/from_gemini` 转成 `StandardRequest`，再交给 `application/runtime`。新增协议时复用这条路径，避免 ds2api 时代的"多入口行为漂移"。
- `StandardRequest.client_profile` 决定 prompt 渲染策略（`CLAUDE_CODE_OPENAI_PROFILE` vs `OPENCLAW_OPENAI_PROFILE` vs `QWEN_CODE_OPENAI_PROFILE`），`api/v1_chat._detect_openai_client_profile` 用 `x-anthropic-billing-header` 区分 Claude Code 客户端。
- 模型名走 `core/config.MODEL_MAP` + `resolve_model()`；默认所有 GPT/Claude/Gemini/DeepSeek 别名都映射到 `qwen3.6-plus`。`/v1/models` 优先返回从账号池拉到的真上游模型，失败时回退到 `MODEL_MAP`。
- `prompt_builder.messages_to_prompt` 会做：schema 压缩、工具名混淆（加 `u_` 前缀避免被 Qwen 内置函数校验拦截）、refusal 清洗、话题隔离、tool few-shot 注入。修改时跑 `test_protocol_regression.py` 验证四个客户端 profile 的输出。
- 工具调用解析是双通道：原生 `tool_calls` 优先（`runtime/tool_directive.native_tool_calls_to_markup`），否则解析文本里的 `##TOOL_CALL## ... ##END_CALL##` JSON 块（`services/tool_parser.parse_tool_calls_silent` + `toolcall/parser.py`）。工具名 case 通过 `_normalize_tool_name_case` 保持（Bash / Edit / Write / Read / Grep / Glob / WebFetch / WebSearch 是大小写敏感的白名单）。

## 鉴权与配额

- `services/auth_quota.resolve_auth_context` 是统一鉴权入口，按顺序读取 `cookie 中的 admin session` → `Authorization: Bearer` → `x-api-key` → `?key=` / `?api_key=`。
- 命中 `settings.ADMIN_KEY`、`API_KEYS`（内存 set，由 `LocalApiKeyStore` / `MongoApiKeyStore` 持久化）或 `users.json` 中的 user.id 任一才放行。
- user 模型带 `quota` 与 `used_tokens`；超限直接 `402`。每次完成后 `add_used_tokens` 按 `services/token_calc.calculate_usage` 累加。
- 管理台 cookie 名 `qwen2api_admin_session`，HMAC(SHA-256, ADMIN_KEY) 签名，12 小时 TTL，HTTPS 下 secure=True。`require_admin_token` 同时接受 cookie 和 Bearer/x-api-key。

## 数据与持久化

- 本地模式：`data/*.json` + `data/context_files/` + `data/uploaded_files/`。`.gitignore` 已经忽略 `data/*.json` 与 `backend/accounts.json`。
- Mongo 模式：同名 collection；上传文件二进制走 GridFS（`MongoGridFSFileStore`）。
- `AsyncJsonDB` 用 `asyncio.Lock` 保证单进程顺序写，所以 `WORKERS > 1` 会破坏一致性。

## 工程约定（与 AGENTS.md 一致，重点重复）

- Python 3.10+，FastAPI/Pydantic 模型放在协议边界。snake_case，错误显式抛出，不做静默 fallback（这是 debug-first 原则，账号失败要让 `executor` 真的标 invalid/rate_limited 而不是吞掉）。
- 前端 React 19 + TS + Tailwind v4，PascalCase 组件，camelCase 变量，共用工具放 `frontend/src/lib/`。
- commit message 用短祈使句（`Refactor protocol layers and fix tool streaming` / `Harden admin auth and CORS`）。**不要在 commit message 加 `Co-Authored-By` 或任何 AI 署名**（全局 AGENTS 规则）。
- 没有正式前端测试。最低验证：`cd frontend && npm run lint && npm run build` + `cd backend && python -m pytest` + 启动后 `curl /healthz`、`curl /readyz`。
- 新增后端测试放 `backend/tests/test_*.py`；不要把名字写成顶层 `test_*.py`，根目录的 `test_*.py` 在 `.gitignore` 里会被忽略。
