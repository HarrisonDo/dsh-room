/**
 * RoomKit · 剧情对话框（视觉小说式）：名牌 + 打字机文字 + 选项按钮；点击/空格/回车推进，数字键选选项，可跳过。
 * line() / choose() 返回 Promise；跳过或关闭时以 { skip:true } 结束，剧情随之收尾。
 */
import { esc } from './ui.js';

export class Dialog {
  constructor(app) {
    this.app = app;
    app.root.insertAdjacentHTML('beforeend', `
      <div class="rk-dialog" role="dialog" aria-live="polite">
        <div class="rk-dlg-head"><span class="rk-dlg-name"></span><span class="rk-dlg-title"></span>
          <button class="rk-dlg-skip" type="button" title="跳过剧情（Esc）">跳过 ⏭</button></div>
        <div class="rk-dlg-text"></div>
        <div class="rk-dlg-choices"></div>
        <div class="rk-dlg-next">▼</div>
      </div>`);
    const el = (this.el = app.root.querySelector('.rk-dialog'));
    this.nameEl = el.querySelector('.rk-dlg-name');
    this.titleEl = el.querySelector('.rk-dlg-title');
    this.textEl = el.querySelector('.rk-dlg-text');
    this.choicesEl = el.querySelector('.rk-dlg-choices');
    this._res = null;
    this._typing = null;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.rk-dlg-skip')) { this.app.stories.skip(); return; }
      const b = e.target.closest('[data-choice]');
      if (b) { this._finish({ index: +b.getAttribute('data-choice') }); return; }
      if (this._mode === 'line') this.advance();
    });
    app.root.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') { e.stopPropagation(); this.app.stories.skip(); return; }
      if ((e.key === ' ' || e.key === 'Enter') && this._mode === 'line') { e.preventDefault(); e.stopPropagation(); this.advance(); return; }
      if (this._mode === 'choice' && /^[1-9]$/.test(e.key)) {
        const i = +e.key - 1;
        if (i < this._count) { e.stopPropagation(); this._finish({ index: i }); }
      }
    }, true);
  }

  isOpen() { return this.el.classList.contains('on'); }
  open(title) {
    this.titleEl.textContent = title ? '· ' + title : '';
    this.el.classList.add('on');
    this.idle();
  }
  close() { this.cancel(); this.el.classList.remove('on', 'busy'); }
  /** 演员在走位、做动作时：收起文字，只留一条细边，表示剧情还在进行 */
  idle() { this.el.classList.add('busy'); this._mode = null; }

  cancel() { this._stopTyping(); if (this._res) this._finish({ skip: true }); }

  line(name, text, color) {
    this._stopTyping();
    this._mode = 'line';
    this.el.classList.remove('busy');
    this.nameEl.textContent = name || '';
    this.nameEl.style.display = name ? '' : 'none';
    this.nameEl.style.background = color || '';
    this.choicesEl.innerHTML = '';
    this.el.classList.remove('choosing');
    this._full = text;
    this._shown = 0;
    this.textEl.textContent = '';
    this.el.classList.add('typing');
    const chars = Array.from(text);
    this._typing = setInterval(() => {
      this._shown = Math.min(chars.length, this._shown + 2);
      this.textEl.textContent = chars.slice(0, this._shown).join('');
      if (this._shown >= chars.length) this._stopTyping();
    }, 40);
    this.app.sfx('tick');
    return new Promise((res) => { this._res = res; });
  }

  choose(text, labels) {
    this._stopTyping();
    this._mode = 'choice';
    this.el.classList.remove('busy', 'typing');
    this.el.classList.add('choosing');
    if (text) { this.nameEl.style.display = 'none'; this.textEl.textContent = text; }
    this._count = labels.length;
    this.choicesEl.innerHTML = labels.map((l, i) => `<button type="button" class="rk-btn" data-choice="${i}"><b>${i + 1}</b> ${esc(l)}</button>`).join('');
    return new Promise((res) => { this._res = res; });
  }

  advance() {
    if (this._mode !== 'line') return;          // 选项出现时只能点选项，点别处不算
    if (this._typing) { this._stopTyping(); this.textEl.textContent = this._full; return; }
    this._finish({ ok: true });
  }

  _stopTyping() {
    if (this._typing) { clearInterval(this._typing); this._typing = null; }
    this.el.classList.remove('typing');
  }
  _finish(v) {
    const r = this._res;
    this._res = null;
    if (v && !v.skip) this.app.sfx('click');
    if (r) r(v);
  }
}
