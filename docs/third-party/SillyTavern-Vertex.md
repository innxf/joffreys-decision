# Vertex认证复用来源

源项目：SillyTavern 1.16.0，src/endpoints/google.js。
原文件：https://github.com/SillyTavern/SillyTavern/blob/1.16.0/src/endpoints/google.js
采用 generateJWTToken / getAccessToken 的服务账号认证实现，保留署名和 AGPL-3.0 许可文本。派生文件为 tools/got/google-auth.mjs；该文件声明 AGPL-3.0-only。

必要改动：本机连接存储、可注入的请求函数、取消信号、本地JSON与RSA校验、内存令牌缓存、去除凭据日志；不移植酒馆整套账号或设置界面。没有复制原项目依赖。

Google消息映射从继承的 module/api-service.js 提取到同一模块的 jxGeminiBody，原调用与权游调用共用。Gemini响应复用当前 completion-reader 的流式读取，不启用自动重试。

本目录是本地发布候选；本说明不为姬侠传原工程、小说文本或图片另行授予许可证。正式公开发行前应保留各自原有来源与许可。
