// The Dovesoft chat loader injects mainWebChatRed.css, whose global !important rules
// (img height, link colours, heading sizes, fonts) override the whole site. The page
// already links assets/dovechat.css, the same rules scoped to the widget
// (tools/scope-chat-css.js), so drop the vendor link before it can apply.
(function () {
  var VENDOR_CSS = /^https:\/\/ccut\.in\/upload\/surveyCommon\/mainWebChatRed\.css(?:[?#]|$)/;
  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeName === 'LINK' && VENDOR_CSS.test(node.href)) {
          node.remove();
          observer.disconnect();
        }
      });
    });
  });
  observer.observe(document.head, { childList: true });
})();
