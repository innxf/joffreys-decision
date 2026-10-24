# Gemini与Vertex设置

仍使用原「正文API」「中间层API」弹窗，两路配置可以独立选择协议。保存、打开设置、发送前预览和JSON校验不请求外部服务。

## 原生Gemini

API类型选Gemini，填API Key与模型ID。默认地址 https://generativelanguage.googleapis.com/v1beta ，也接受包含 models/模型:generateContent 的完整生成地址。密钥不放在URL中。模型列表按钮才请求列表。

消息沿姬侠传原转换：system合并为systemInstruction，assistant映射为model，文本放入parts。发送预览展示实际转换后的消息和参数。未支持的酒馆参数保留在预设中并列出提示，不悄悄冒充已生效。

## Google Vertex AI（完整版Service Account）

API类型选「Google Vertex AI · 服务账号JSON」。粘贴完整Google服务账号JSON；支持project_id、client_email及private_key的正式账号文件。地区填写Google模型支持的region，默认us-central1；global使用全局地址。项目从JSON读取，模型ID手填。

「验证JSON」只核对字段、JSON和RSA私钥格式，不联网，不验证IAM权限、计费或模型可用性。保存后私钥不回显；同一连接留空保留本机已保存账号。实际请求才用RS256签名换取短期访问令牌，令牌仅保存在服务进程内存中。

客户端、游戏存档、预设导出和发送预览没有私钥或访问令牌。更换账号时粘贴新JSON并保存为新配置版本；已经开始的请求仍用原冻结配置。错误、取消、截断均不自动再次请求。

当前覆盖：Gemini原生API Key、Vertex完整Service Account模式。未声称支持Vertex Express API Key、酒馆全部反向代理分支、ADC、工作负载身份或原生Google Embedding。OpenAI兼容中转仍选择原OpenAI类型，已有向量接口保持原配置。

复用依据：姬侠传 module/api-service.js 的Gemini消息映射与原配置弹窗；SillyTavern 1.16.0 src/endpoints/google.js 的服务账号JWT/OAuth流程。相关派生文件及许可见 docs/third-party。

本轮只有离线固定服务检查，未请求真实Google或用户付费API。
