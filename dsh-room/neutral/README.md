# RoomKit Neutral

独立的 RoomKit 场景编辑器与联机客户端。示例庭院使用程序绘制的角色、信标和出口。

用 Node.js 24 解包后，在包目录运行 `npm run serve`，打开 [示例庭院](http://127.0.0.1:18766/)。布置可编辑场景。「社区 → AI 小镇」可连接兼容的联机服务，使用邀请、合作活动和本机经历。小镇服务端另行提供。示例内容包以嵌入式道具发布，依赖大肥鱼版内置家具的世界需要转换为独立的内容包。

可选模型使用本机预览网关。在启动预览的环境里配置 `ROOMKIT_MODEL_URL`（完整的 Chat Completions 地址）、`ROOMKIT_MODEL` 和需要时的 `ROOMKIT_MODEL_KEY`。两人也可手动完成活动。

## 对应源码与重建

此候选的源码归档与 npm 归档一起交付。核对 `SHA256SUMS`，解开源码归档，在其根目录用 Node.js 24 运行 `npm ci` 和 `npm pack`。安装依赖需要 npm registry 或相应缓存。构建使用锁定的 esbuild 0.25.12。源码树与归档中的输入清单对应，无需原工作区。

[许可证正文](LICENSE) · [署名与范围](NOTICE.md)
