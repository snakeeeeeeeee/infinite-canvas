# SuperToken 参考素材临时上传缓存设计

## 目标

Canvas 本地 IndexedDB 中的图片、视频和音频 Blob 是参考素材的长期来源。SuperToken `/v1/media/uploads/complete` 返回的 URL 仅用于向生成服务传递素材，不写回画布资产本身。

## 缓存规则

- 使用独立的 `supertoken_media_uploads` IndexedDB store 保存完成上传响应。
- 缓存以渠道 ID、API 节点和本地 `storageKey` 共同隔离，避免不同渠道或地区节点误用同一记录。
- 使用完成响应中的 `temporary` 和 `expires_at` 判断可复用性；临时 URL 距离过期不足 30 分钟时按已过期处理。
- 本地 Blob 存在时优先使用 Blob 和有效上传缓存，不采用资产上残留的 HTTP URL。
- 缓存缺失或即将过期时重新上传，并用新的完成响应覆盖缓存。
- 本地 Blob 不存在时保留远程 URL 直连能力；本地与远程来源都不可用时给出明确错误。

## 失败恢复

视频任务创建同步返回结构化的参考素材缺失或过期错误时，Canvas 删除本次引用对应的上传缓存，强制重新上传并只重试一次。异步任务后来报告相同错误时清除缓存，确保用户下一次重试会重新上传，而不会继续复用失效 URL。

## 验收

- 完成响应的 `temporary`、`expires_at` 被解析和持久化。
- 有效期超过 30 分钟时复用 URL，等于或不足 30 分钟时不复用。
- 同一 `storageKey` 在不同渠道或 API 节点下使用不同缓存键。
- 带有 HTTP URL 的本地素材仍优先读取本地 Blob。
- 结构化引用失效错误只触发一次安全重试，其他错误不重试。
