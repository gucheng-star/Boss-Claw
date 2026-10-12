'use strict';
const { ipcRenderer } = require('electron');
const humanize = require('./humanize.cjs');
const fs = require('node:fs');
const path = require('node:path');
let notifications = [], events = [], mutateOnHover = false, activeConfig;
function notify(channel, data) { notifications.push({ channel, data }); }

// Directly evaluate the AST-selected production declarations in this preload's
// lexical scope. trustedInput and all timing/native IPC helpers remain real.
eval(fs.readFileSync(path.join(__dirname, 'production-helpers.cjs'), 'utf8') + `
ipcRenderer.on('fixture-run', async (_event, cfg) => {
  try {
    activeConfig = cfg; notifications = []; events = []; lastCursor = null; mutateOnHover = false;
    const input = document.querySelector('#chat-input'), button = document.querySelector('#text-send');
    document.querySelector('#messages').innerHTML = '<li class="message-item item-myself" data-message-id="historic-1"><div class="text">历史消息</div></li>';
    document.querySelector('#fixture-style')?.remove();
    const style = document.createElement('style'); style.id = 'fixture-style';
    style.textContent = cfg.layout === 'fixed'
      ? 'body{margin:0}.chat-conversation{width:90%;height:1400px}.chat-message{height:1000px;overflow:auto}.chat-editor{position:fixed;bottom:0;left:0;width:90%;background:white}'
      : '.chat-conversation{width:85%}';
    document.head.append(style);
    button.style.position = 'relative';
    button.innerHTML = cfg.nested
      ? '<span id="nested-icon" style="position:absolute;inset:0"><svg width="100%" height="100%"><rect width="100%" height="100%" fill="transparent"/></svg></span><span>发送</span>'
      : '发送';
    window.scrollTo(0, cfg.layout === 'fixed' ? 550 : 0);
    if (cfg.layout === 'fixed') document.querySelector('.chat-message').scrollTop = 250;
    input.textContent = ''; input.focus();
    const text = '离线原生输入测试 ' + cfg.name;
    const typed = await trustedInput('insertText', text);
    await sleep(120);
    const context = createChatSendContext(input), before = context && captureOwnMessages(context);
    mutateOnHover = Boolean(cfg.guardFailure);
    const result = await sendChatMessage(context, text, before);
    ipcRenderer.send('fixture-result', { name: cfg.name, cfg, text, typed, result, events, notifications,
      input: input.textContent,
      ownMessages: [...document.querySelectorAll('.item-myself .text')].map(element => element.textContent),
      viewport: { width: innerWidth, height: innerHeight, scrollY, devicePixelRatio },
      buttonRect: button.getBoundingClientRect().toJSON(),
      focus: { document: document.hasFocus(), active: document.activeElement?.id } });
  } catch (error) { ipcRenderer.send('fixture-result', { name: cfg.name, error: error.stack, events, notifications }); }
});
`);

window.addEventListener('DOMContentLoaded', () => {
  for (const type of ['mousemove', 'mousedown', 'mouseup', 'click', 'beforeinput', 'input']) {
    document.addEventListener(type, event => {
      if (type !== 'mousemove' || events.filter(entry => entry.type === 'mousemove').length < 30) {
        const button = document.querySelector('#text-send');
        events.push({ type, trusted: event.isTrusted, target: event.target.id || event.target.tagName,
          withinSend: event.target === button || button.contains(event.target),
          x: event.clientX, y: event.clientY, inputType: event.inputType });
      }
      if (type === 'mousemove' && mutateOnHover) {
        mutateOnHover = false;
        document.querySelector('#chat-input').textContent = 'guard mutated draft';
      }
    }, true);
  }
  document.querySelector('#text-send').addEventListener('click', event => {
    if (!event.isTrusted || activeConfig?.noBubble) return;
    const input = document.querySelector('#chat-input');
    if (!input.textContent) return;
    const row = document.createElement('li'); row.className = 'message-item item-myself'; row.dataset.messageId = 'new-' + Date.now();
    const text = document.createElement('div'); text.className = 'text'; text.textContent = input.textContent;
    row.append(text); document.querySelector('#messages').append(row); input.textContent = '';
  });
  ipcRenderer.send('fixture-guest-ready');
});
