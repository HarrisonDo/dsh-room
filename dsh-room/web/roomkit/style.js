/**
 * RoomKit · 样式（随引擎注入，DSH 右侧栏 / iframe / 整页都不需要额外 CSS 文件）。
 * 主题变量：--rk-bg-a/--rk-bg-b 由渲染器按天色更新；.rk-night 夜间配色。
 */
export const CSS = `
.rk-root{position:relative;overflow:hidden;width:100%;height:100%;min-height:240px;user-select:none;-webkit-user-select:none;
  background:radial-gradient(120% 90% at 50% 18%,var(--rk-bg-a,#eef7fb),var(--rk-bg-b,#d6e9f2));
  font:13px/1.45 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#243047;
  --rk-panel:rgba(255,255,255,.9);--rk-line:rgba(40,60,100,.12);--rk-ink:#243047;--rk-sub:#6a7892;--rk-acc:#4d7cf3;
  transition:background 2s}
.rk-root.rk-night{color:#e8eefb;--rk-panel:rgba(18,26,46,.9);--rk-line:rgba(160,190,255,.16);--rk-ink:#e8eefb;--rk-sub:#9fb0d0}
.rk-root.rk-transparent{background:transparent}
.rk-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:default}
.rk-root.rk-hand .rk-canvas{cursor:pointer}
.rk-root.rk-panning .rk-canvas{cursor:grabbing}
.rk-root button{font:inherit;color:inherit}

.rk-tip{position:absolute;left:0;top:0;pointer-events:none;z-index:20;padding:3px 10px;border-radius:999px;white-space:nowrap;
  background:rgba(20,28,48,.78);color:#fff;font-size:12px;opacity:0;transform:translate(-50%,-120%);transition:opacity .15s}
.rk-tip.on{opacity:1}
.rk-tip small{opacity:.72;margin-left:6px}

.rk-bubbles{position:absolute;inset:0;pointer-events:none;z-index:18}
.rk-bubble{position:absolute;transform:translate(-50%,-100%);width:max-content;max-width:220px;padding:5px 11px;border-radius:13px;
  background:rgba(255,255,255,.96);color:#1f2a40;font-size:12.5px;line-height:1.4;box-shadow:0 4px 14px rgba(20,30,60,.16);
  white-space:pre-wrap;word-break:break-word;animation:rkPop .22s ease-out}
.rk-bubble:after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-top-color:rgba(255,255,255,.96);border-bottom:0}
.rk-bubble b{color:#4d7cf3;font-weight:600;margin-right:4px}
@keyframes rkPop{from{opacity:0;transform:translate(-50%,-80%) scale(.9)}to{opacity:1;transform:translate(-50%,-100%) scale(1)}}
.rk-float{position:absolute;transform:translate(-50%,-100%);pointer-events:none;z-index:19;padding:3px 10px;border-radius:999px;
  background:rgba(255,255,255,.94);color:#24304a;font-size:12px;white-space:nowrap;animation:rkFloat 1.5s ease-out forwards}
@keyframes rkFloat{0%{opacity:0;transform:translate(-50%,-70%)}15%{opacity:1}100%{opacity:0;transform:translate(-50%,-220%)}}

.rk-btn{border:1px solid var(--rk-line);background:var(--rk-panel);border-radius:999px;padding:5px 11px;cursor:pointer;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 8px rgba(20,30,60,.08);white-space:nowrap;font-size:12.5px}
.rk-btn:hover{border-color:rgba(77,124,243,.5)}
.rk-btn.on{background:var(--rk-acc);color:#fff;border-color:var(--rk-acc)}
.rk-btn.icon{padding:5px 9px}

/* ── 外壳：顶栏 / Dock / 侧抽屉（shell.js） ── */
.rk-top{position:absolute;left:8px;right:8px;top:8px;z-index:30;display:flex;gap:6px;align-items:center}
.rk-top-gap{flex:1}
.rk-scene-btn{display:inline-flex;align-items:center;gap:5px;max-width:46%;font-weight:600;flex:0 1 auto;min-width:0}
.rk-scene-btn b{overflow:hidden;text-overflow:ellipsis;font-weight:600}
.rk-scene-btn i{font-style:normal;opacity:.55;font-size:10px}
.rk-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#9aa6bb;flex:0 0 auto}
.rk-conn{display:inline-flex;align-items:center;gap:5px}
.rk-conn[data-level=ok] .rk-dot,.rk-dot[data-ok="1"]{background:#3cc27a;box-shadow:0 0 0 3px rgba(60,194,122,.18)}
.rk-conn[data-level=partial] .rk-dot{background:#f0b43c;box-shadow:0 0 0 3px rgba(240,180,60,.2)}
.rk-conn[data-level=error] .rk-dot,.rk-dot[data-ok="0"]{background:#e5534b;box-shadow:0 0 0 3px rgba(229,83,75,.18)}
.rk-compact .rk-top{left:6px;right:6px;top:6px;gap:4px}
.rk-compact .rk-top .rk-btn{padding:4px 8px}
.rk-compact .rk-conn span{display:none}
/* 房间条（宽档）：家里的房间按楼层排开，像参考站的楼层按钮 */
.rk-rooms{display:none;gap:2px;padding:3px;border-radius:999px;background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 2px 8px rgba(20,30,60,.08);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);overflow:hidden;min-width:0}
.rk-wide .rk-rooms:not(:empty){display:flex}
.rk-rooms button{border:0;background:none;border-radius:999px;padding:3px 10px;cursor:pointer;font-size:12.5px;color:var(--rk-sub);white-space:nowrap}
.rk-rooms button small{font-size:10px;opacity:.7;margin-right:4px;letter-spacing:.04em}
.rk-rooms button:hover{color:var(--rk-ink);background:rgba(77,124,243,.1)}
.rk-rooms button.on{background:var(--rk-acc);color:#fff}
/* 下拉菜单 */
.rk-menu{position:absolute;z-index:62;display:none;min-width:208px;max-width:min(300px,calc(100% - 12px));max-height:calc(100% - 12px);overflow:auto;padding:6px;border-radius:14px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 14px 36px rgba(20,30,60,.24);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.rk-menu.on{display:block;animation:rkPop2 .14s ease-out}
.rk-menu > button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;border-radius:9px;padding:7px 9px;cursor:pointer;text-align:left;font-size:13px;color:var(--rk-ink)}
.rk-menu > button:hover{background:rgba(77,124,243,.12)}
.rk-menu > button.on{color:var(--rk-acc);font-weight:600}
.rk-menu > button span{width:18px;text-align:center;flex:0 0 auto}
.rk-menu > button small{margin-left:auto;color:var(--rk-sub);font-size:11px}
.rk-menu > button em{margin-left:auto;font-style:normal;color:var(--rk-acc);font-weight:700}
.rk-menu hr{border:0;border-top:1px solid var(--rk-line);margin:5px 4px}
.rk-menu-title{padding:5px 9px 3px;font-weight:600;font-size:12.5px}
.rk-menu-sep{padding:6px 9px 2px;color:var(--rk-sub);font-size:11px;letter-spacing:.06em}
.rk-menu .rk-chips{padding:2px 6px 4px;margin:0}
.rk-menu-in{display:flex;gap:4px;padding:3px 6px}
.rk-menu-in input{flex:1;min-width:0;padding:5px 8px;border-radius:8px;border:1px solid var(--rk-line);background:transparent;color:inherit;font:inherit;user-select:text;-webkit-user-select:text}
.rk-menu-in button{border:1px solid var(--rk-line);background:none;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:12px;white-space:nowrap}
/* 换房间转场：两扇门合上 / 打开 + 楼层闪字 */
.rk-curtain{position:absolute;inset:0;z-index:58;display:none;pointer-events:none;overflow:hidden}
.rk-curtain.on{display:block;pointer-events:auto}
.rk-curtain i{position:absolute;top:0;bottom:0;width:50.5%;background:linear-gradient(90deg,#1c2645,#26335a);transition:transform .32s cubic-bezier(.6,0,.3,1)}
.rk-curtain i:first-child{left:0;transform:translateX(-101%);box-shadow:inset -3px 0 0 rgba(255,255,255,.08)}
.rk-curtain i:nth-child(2){right:0;transform:translateX(101%);background:linear-gradient(270deg,#1c2645,#26335a)}
.rk-curtain.shut i{transform:none}
.rk-curtain b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#fff;font-size:18px;letter-spacing:.08em;opacity:0;transition:opacity .2s;white-space:nowrap}
.rk-curtain.shut b{opacity:.92;transition-delay:.18s}
.rk-flash{position:absolute;left:50%;top:22%;transform:translate(-50%,-50%);z-index:44;pointer-events:none;opacity:0;color:#fff;font-size:26px;font-weight:600;
  letter-spacing:.06em;text-shadow:0 2px 14px rgba(10,20,50,.55);white-space:nowrap}
.rk-flash small{display:block;text-align:center;font-size:12px;letter-spacing:.3em;opacity:.85;margin-bottom:2px}
.rk-flash.on{animation:rkFlash 1.5s ease-out forwards}
@keyframes rkFlash{0%{opacity:0;transform:translate(-50%,-30%)}15%{opacity:1;transform:translate(-50%,-50%)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%)}}
.rk-compact .rk-flash{font-size:20px}
.rk-edit .rk-top{right:276px}
.rk-compact.rk-edit .rk-top{right:6px}
.rk-dock{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:32;display:flex;gap:2px;padding:4px;border-radius:18px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 8px 24px rgba(20,30,60,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);max-width:calc(100% - 16px)}
.rk-dock button{display:flex;flex-direction:column;align-items:center;gap:0;min-width:52px;padding:5px 8px 4px;border:0;border-radius:14px;background:none;cursor:pointer;color:var(--rk-sub)}
.rk-dock button span{font-size:17px;line-height:1.15}
.rk-dock button small{font-size:11px}
.rk-dock button:hover{background:rgba(77,124,243,.1);color:var(--rk-ink)}
.rk-dock button.on{background:var(--rk-acc);color:#fff}
.rk-compact .rk-dock{bottom:6px;left:6px;right:6px;transform:none;justify-content:space-around}
.rk-compact .rk-dock button{min-width:0;flex:1;padding:4px 2px 3px}
.rk-compact .rk-dock button span{font-size:15px}
.rk-compact .rk-dock button small{font-size:10px}
.rk-edit .rk-dock,.rk-storying .rk-dock,.rk-storying .rk-top,.rk-storying .rk-story-pill,.rk-storying .rk-menu{display:none}
.rk-sheet{position:absolute;right:8px;top:50px;bottom:72px;width:300px;z-index:41;display:none;flex-direction:column;border-radius:16px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 12px 34px rgba(20,30,60,.2);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);overflow:hidden}
.rk-sheet.on{display:flex;animation:rkPop2 .18s ease-out}
.rk-sheet header{display:flex;align-items:center;padding:10px 14px 8px;border-bottom:1px solid var(--rk-line);position:relative}
.rk-sheet header b{font-size:14px}
.rk-sheet-body{flex:1;overflow:auto;padding:10px 12px 12px}
.rk-compact .rk-sheet{left:6px;right:6px;width:auto;top:auto;bottom:62px;height:min(62%,420px)}
.rk-story-pill{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);z-index:31;display:none;gap:4px}
.rk-story-pill.on{display:flex;animation:rkPopC .25s ease-out}
.rk-story-pill .rk-btn b{color:var(--rk-acc);margin-left:4px}
.rk-compact .rk-story-pill{bottom:62px}
.rk-coach{position:absolute;left:50%;top:56px;transform:translateX(-50%);z-index:42;display:none;width:min(360px,calc(100% - 24px));padding:12px 14px;border-radius:14px;
  background:rgba(36,60,120,.94);color:#fff;font-size:12.5px;line-height:1.7;box-shadow:0 12px 30px rgba(20,30,60,.3)}
.rk-coach.on{display:block;animation:rkPopC .3s ease-out}
.rk-coach span{background:rgba(255,255,255,.2);border-radius:6px;padding:0 5px;margin:0 2px}
.rk-coach .rk-btn{display:block;margin:8px 0 0 auto;color:#24304a;background:#fff;box-shadow:none}
.rk-progress{display:grid;grid-template-columns:1fr auto;gap:4px 8px;margin-bottom:10px;font-size:12px;color:var(--rk-sub)}
.rk-progress b{color:var(--rk-ink)}
.rk-progress i{grid-column:1/3;height:6px;border-radius:9px;background:var(--rk-line);overflow:hidden;position:relative}
.rk-progress i b{position:absolute;left:0;top:0;bottom:0;background:var(--rk-acc);border-radius:9px}
.rk-story{display:flex;align-items:center;gap:8px;padding:8px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px}
.rk-story > div{flex:1;min-width:0;display:flex;flex-direction:column}
.rk-story small{color:var(--rk-sub);font-size:11.5px}
.rk-story.seen b{color:var(--rk-sub)}
.rk-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--rk-sub);cursor:pointer}
.rk-opt{display:flex;align-items:flex-start;padding:8px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px}
.rk-opt span{display:flex;flex-direction:column}
.rk-opt b{color:var(--rk-ink);font-weight:600}
.rk-mapgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.rk-maphead{display:flex;flex-direction:column;margin-bottom:4px}
.rk-maphead b{font-size:14px}
.rk-maphead small{color:var(--rk-sub);font-size:11.5px}
.rk-floor{position:relative;padding:8px 0 4px 34px;border-top:1px dashed var(--rk-line)}
.rk-floor:first-of-type{border-top:0}
.rk-floor .rk-mapgrid{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}
.rk-floor-tag{position:absolute;left:0;top:10px;width:28px;padding:3px 0;border-radius:8px;background:rgba(77,124,243,.14);color:var(--rk-acc);font-size:11px;font-weight:700;text-align:center}
.rk-mapcard{position:relative;display:flex;flex-direction:column;gap:1px;padding:6px;border-radius:12px;background:rgba(127,140,170,.09);cursor:pointer;border:1px solid transparent}
.rk-mapcard:hover{border-color:rgba(77,124,243,.5)}
.rk-mapcard.cur{border-color:var(--rk-acc);background:rgba(77,124,243,.1)}
.rk-mapcard-more{position:absolute;right:4px;top:4px;width:24px;height:22px;border-radius:7px;border:0;background:var(--rk-panel);color:var(--rk-sub);cursor:pointer;opacity:.75}
.rk-mapcard-more:hover{opacity:1;color:var(--rk-acc)}
.rk-chips.rk-inline{display:inline-flex;margin:0 0 0 4px;vertical-align:middle}
.rk-mapcard canvas{width:100%;height:auto;aspect-ratio:5/3}
.rk-mapcard b{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk-mapcard small{color:var(--rk-sub);font-size:11px}
.rk-mapnew{align-items:center;justify-content:center;min-height:90px}
.rk-mapnew span{font-size:24px;color:var(--rk-sub)}
.rk-sheet-chat .rk-sheet-body{display:flex;flex-direction:column;padding-bottom:8px}
.rk-chat-who{font-size:12.5px;margin-bottom:6px;display:flex;flex-direction:column}
.rk-chat-head{display:flex;align-items:center;justify-content:space-between;gap:6px}
.rk-chat-who small{color:var(--rk-sub);font-size:11px}
.rk-chat-log{flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:4px 0;min-height:80px}
.rk-msg{display:flex}
.rk-msg span{max-width:85%;padding:6px 10px;border-radius:12px;background:rgba(127,140,170,.14);white-space:pre-wrap;word-break:break-word;font-size:13px}
.rk-msg.user{justify-content:flex-end}
.rk-msg.user span{background:var(--rk-acc);color:#fff}
.rk-msg.pending span{opacity:.6;font-style:italic}
.rk-msg{flex-wrap:wrap}
.rk-msg small{flex-basis:100%;color:var(--rk-sub);font-size:11px;margin-top:2px}
.rk-msg.user small{text-align:right}
.rk-chat-bar{display:flex;gap:6px;margin-top:6px}
.rk-chat-in{flex:1;min-width:0;padding:7px 10px;border-radius:999px;border:1px solid var(--rk-line);background:transparent;color:inherit;font:inherit;user-select:text;-webkit-user-select:text}
.rk-diag-row{display:grid;grid-template-columns:12px 64px 1fr;align-items:center;gap:6px;padding:5px 0;border-bottom:1px dashed var(--rk-line);font-size:12.5px}
.rk-diag-row small{color:var(--rk-sub);font-size:11.5px;word-break:break-all}
.rk-thread{align-items:center}
.rk-thread span{display:flex;flex-direction:column}
.rk-thread small{color:var(--rk-sub);font-size:11px}
.rk-tag{font-style:normal;font-size:10px;margin-left:4px;padding:0 4px;border-radius:6px;background:rgba(127,140,170,.25)}
.rk-soon{padding:10px;border-radius:10px;background:rgba(127,140,170,.08);font-size:12.5px;line-height:1.8}
.rk-soon small{color:var(--rk-sub);line-height:1.5;display:block;margin-top:4px}

.rk-toast{position:absolute;left:50%;bottom:80px;transform:translateX(-50%);z-index:60;padding:6px 14px;border-radius:999px;
  background:rgba(20,28,48,.84);color:#fff;font-size:12.5px;opacity:0;pointer-events:none;transition:opacity .25s}
.rk-toast.on{opacity:1}
.rk-compact.rk-edit .rk-toast{bottom:auto;top:84px}

.rk-card,.rk-drawer{position:absolute;z-index:40;width:236px;padding:12px 14px;border-radius:14px;background:var(--rk-panel);
  border:1px solid var(--rk-line);box-shadow:0 10px 30px rgba(20,30,60,.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:none}
.rk-card.on,.rk-drawer.on{display:block;animation:rkPop2 .18s ease-out}
@keyframes rkPop2{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes rkPopC{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
.rk-card{right:10px;bottom:76px}
.rk-door .rk-row{margin-bottom:4px}
.rk-drawer{right:10px;top:52px}
.rk-compact .rk-card{bottom:62px}
.rk-compact .rk-drawer{left:6px;right:6px;width:auto;top:44px}
.rk-x{position:absolute;right:10px;top:8px;cursor:pointer;color:var(--rk-sub);font-size:15px;border:0;background:none}
.rk-card h4,.rk-drawer h4{margin:0 0 2px;font-size:14px}
.rk-sub{color:var(--rk-sub);font-size:12px;margin-bottom:8px}
.rk-need{display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0}
.rk-need span{width:30px;color:var(--rk-sub)}
.rk-need i{flex:1;height:6px;border-radius:9px;background:var(--rk-line);overflow:hidden;position:relative}
.rk-need i b{position:absolute;left:0;top:0;bottom:0;border-radius:9px;background:var(--rk-acc);transition:width .6s}
.rk-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.rk-row .rk-btn{padding:4px 9px;font-size:12px;box-shadow:none}
.rk-kv{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:2px 0}
.rk-kv span:first-child{color:var(--rk-sub)}

/* ── 布置模式 ── */
.rk-panel{position:absolute;right:10px;top:10px;bottom:10px;width:248px;z-index:35;display:none;flex-direction:column;
  border-radius:16px;background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 10px 30px rgba(20,30,60,.16);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);overflow:hidden}
.rk-edit .rk-panel{display:flex}
.rk-tabs{display:flex;border-bottom:1px solid var(--rk-line)}
.rk-tabs button{flex:1;border:0;background:none;padding:9px 0;cursor:pointer;color:var(--rk-sub);font-size:12.5px}
.rk-tabs button.on{color:var(--rk-acc);box-shadow:inset 0 -2px 0 var(--rk-acc)}
.rk-pane{flex:1;overflow:auto;padding:10px;display:none}
.rk-pane.on{display:block}
.rk-chips{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
.rk-chips button{border:1px solid var(--rk-line);background:none;border-radius:999px;padding:2px 9px;cursor:pointer;font-size:11.5px;color:var(--rk-sub)}
.rk-chips button.on{background:var(--rk-acc);border-color:var(--rk-acc);color:#fff}
.rk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:6px}
.rk-item{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px 5px;border-radius:10px;cursor:pointer;
  border:1px solid transparent;background:rgba(127,140,170,.08);font-size:11px;text-align:center}
.rk-item:hover{border-color:rgba(77,124,243,.45)}
.rk-item.on{border-color:var(--rk-acc);background:rgba(77,124,243,.12)}
.rk-item canvas,.rk-item img{width:56px;height:56px;object-fit:contain}
.rk-field{margin:10px 0 4px;color:var(--rk-sub);font-size:11.5px;letter-spacing:.03em}
.rk-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rk-line input[type=color]{width:30px;height:24px;border:1px solid var(--rk-line);border-radius:6px;padding:0;background:none;cursor:pointer}
.rk-line input[type=range]{flex:1}
.rk-line input[type=text],.rk-line select{flex:1;min-width:0;padding:4px 6px;border:1px solid var(--rk-line);border-radius:8px;background:transparent;color:inherit;font:inherit}
.rk-step{display:inline-flex;align-items:center;border:1px solid var(--rk-line);border-radius:999px;overflow:hidden}
.rk-step button{border:0;background:none;padding:2px 9px;cursor:pointer}
.rk-step b{min-width:22px;text-align:center;font-weight:600}
.rk-agent{display:flex;align-items:center;gap:8px;padding:6px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px}
.rk-agent i{width:14px;height:14px;border-radius:50%;flex:0 0 auto}
.rk-agent input{flex:1;min-width:0;border:0;background:none;color:inherit;font:inherit}
.rk-agent select{border:1px solid var(--rk-line);border-radius:6px;background:transparent;color:inherit;font-size:11.5px}
.rk-agent button{border:0;background:none;cursor:pointer;color:var(--rk-sub)}
.rk-ebar{position:absolute;left:10px;bottom:10px;z-index:36;display:none;gap:6px;flex-wrap:wrap}
.rk-edit .rk-ebar{display:flex}
.rk-sel{position:absolute;z-index:37;display:none;gap:4px;transform:translate(-50%,-100%);padding:4px;border-radius:999px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 6px 18px rgba(20,30,60,.18)}
.rk-sel.on{display:flex}
.rk-sel button{border:0;background:none;cursor:pointer;padding:3px 8px;border-radius:999px;font-size:12px}
.rk-sel button:hover{background:rgba(77,124,243,.14)}
.rk-hint{color:var(--rk-sub);font-size:11.5px;margin-top:8px;line-height:1.5}
.rk-compact .rk-panel{left:6px;right:6px;top:auto;bottom:6px;width:auto;height:46%}
.rk-compact .rk-ebar{bottom:auto;top:46px;left:6px}
.rk-compact .rk-card{left:6px;right:6px;width:auto}

/* ── 剧情对话框（视觉小说式） ── */
.rk-dialog{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);width:min(640px,calc(100% - 24px));z-index:45;
  padding:12px 18px 16px;border-radius:16px;background:rgba(255,255,255,.95);color:#1f2a40;border:1px solid rgba(40,60,100,.12);
  box-shadow:0 14px 40px rgba(20,30,60,.22);display:none;font-size:15px;line-height:1.65;cursor:pointer;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.rk-dialog.on{display:block;animation:rkPop2 .2s ease-out}
.rk-dialog.busy{padding:7px 14px;opacity:.8}
.rk-dialog.busy .rk-dlg-text,.rk-dialog.busy .rk-dlg-next,.rk-dialog.busy .rk-dlg-choices,.rk-dialog.busy .rk-dlg-name{display:none}
.rk-dlg-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.rk-dlg-name{padding:1px 12px;border-radius:999px;background:#4d7cf3;color:#fff;font-size:12.5px;font-weight:600;text-shadow:0 1px 1px rgba(0,0,0,.15)}
.rk-dlg-title{color:#8592aa;font-size:12px;flex:1}
.rk-dlg-skip{border:0;background:none;color:#8592aa;cursor:pointer;font-size:12px;padding:2px 4px}
.rk-dlg-skip:hover{color:#4d7cf3}
.rk-dlg-text{min-height:3.1em;white-space:pre-wrap}
.rk-dlg-next{position:absolute;right:16px;bottom:8px;color:#4d7cf3;font-size:11px;animation:rkBlink 1s infinite}
.rk-dialog.typing .rk-dlg-next,.rk-dialog.choosing .rk-dlg-next{display:none}
@keyframes rkBlink{50%{opacity:.2}}
.rk-dlg-choices{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.rk-dlg-choices .rk-btn{text-align:left;border-radius:12px;padding:8px 12px;font-size:14px;box-shadow:none}
.rk-dlg-choices .rk-btn b{color:#4d7cf3;margin-right:6px}
.rk-night .rk-dialog{background:rgba(20,28,48,.94);color:#e8eefb;border-color:rgba(160,190,255,.16)}
.rk-compact .rk-dialog{font-size:13.5px;padding:9px 12px 12px;bottom:6px;width:calc(100% - 12px)}

/* ── 模态框（自制家具 / 导入） ── */
.rk-modal{position:absolute;inset:0;z-index:70;display:none;align-items:center;justify-content:center;background:rgba(10,16,30,.35)}
.rk-modal.on{display:flex}
.rk-modal-box{width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:14px 16px;border-radius:16px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 20px 50px rgba(0,0,0,.3);color:var(--rk-ink)}
.rk-modal-box h4{margin:0 0 8px;font-size:15px}
.rk-ws{display:flex;gap:12px;flex-wrap:wrap}
.rk-ws canvas{width:220px;height:200px;border-radius:12px;background:rgba(127,140,170,.12);flex:0 0 auto}
.rk-ws .rk-ws-form{flex:1;min-width:200px}
.rk-ws label{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--rk-sub);margin:5px 0}
.rk-ws label input[type=range]{flex:1}
.rk-ws label input[type=text],.rk-ws label select,.rk-ws label input[type=number]{flex:1;min-width:0;padding:3px 6px;border:1px solid var(--rk-line);border-radius:8px;background:transparent;color:inherit;font:inherit}
.rk-pack{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px;font-size:12px}
.rk-pack b{font-size:12.5px}
.rk-pack span{flex:1;color:var(--rk-sub)}
.rk-pack button{border:0;background:none;cursor:pointer;color:var(--rk-sub)}
.rk-scene{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:10px;background:rgba(127,140,170,.08);margin-bottom:6px;font-size:12.5px;cursor:pointer}
.rk-scene.on{outline:2px solid var(--rk-acc)}
.rk-scene span{flex:1}
.rk-scene small{color:var(--rk-sub)}
.rk-scene button{border:0;background:none;cursor:pointer;color:var(--rk-sub);padding:2px 4px}

/* 桌面模式：只剩房间和角色（desk.js） */
.rk-desk{min-height:0}
.rk-desk .rk-top,.rk-desk .rk-dock,.rk-desk .rk-sheet,.rk-desk .rk-menu,.rk-desk .rk-coach,.rk-desk .rk-story-pill{display:none!important}
.rk-desk .rk-card,.rk-desk.rk-compact .rk-card{left:auto;right:6px;bottom:6px;width:min(236px,calc(100% - 12px));max-height:calc(100% - 12px);overflow:auto}
.rk-desk .rk-drawer{top:6px}
.rk-desk .rk-dialog{bottom:6px;width:calc(100% - 12px)}
.rk-desk .rk-canvas{cursor:grab}
.rk-desk.rk-hand .rk-canvas{cursor:pointer}
.rk-desk-btn{position:absolute;left:50%;top:4px;z-index:50;transform:translateX(-50%);width:28px;height:20px;padding:0;border-radius:999px;
  border:1px solid var(--rk-line);background:var(--rk-panel);color:var(--rk-ink);cursor:pointer;line-height:16px;opacity:0;transition:opacity .25s;
  box-shadow:0 3px 10px rgba(20,30,60,.18)}
.rk-desk.rk-desk-hover .rk-desk-btn,.rk-desk-btn:focus-visible{opacity:1}
.rk-desk-menu{position:absolute;z-index:60;display:none;flex-direction:column;min-width:140px;padding:4px;border-radius:12px;
  background:var(--rk-panel);border:1px solid var(--rk-line);box-shadow:0 10px 30px rgba(20,30,60,.22)}
.rk-desk-menu.on{display:flex}
.rk-desk-menu button{border:0;background:none;text-align:left;padding:5px 10px;border-radius:8px;cursor:pointer}
.rk-desk-menu button:hover{background:rgba(127,140,170,.14)}
.rk-desk-menu button.on{color:var(--rk-acc);font-weight:600}
.rk-desk-menu hr{border:0;border-top:1px solid var(--rk-line);margin:3px 6px}
`;

let injected = false;
export function injectCss(doc = document) {
  if (injected && doc === document) return;
  const s = doc.createElement('style');
  s.setAttribute('data-roomkit', '');
  s.textContent = CSS;
  doc.head.appendChild(s);
  if (doc === document) injected = true;
}
