(function (root) {
  "use strict";
  root.securePickingBookmarklet = function (source) {
    const marker = /\(async function ([A-Za-z0-9_]+)\(\)\{/;
    if (!marker.test(source)) throw new Error("북마클릿 인증 위치를 찾지 못했습니다.");
    const factory = root.SystemV3PickingAuthFactory.toString();
    const setup = `
      var toolAuth = await (${factory})().createToolAuth({
        url:"https://vgxocngpykhlkosiaeew.supabase.co",
        key:"sb_publishable_XVnKGJo66GZiYTq5Ivu8dA_SjBVvX0g",
        fetch:window.fetch.bind(window), storage:window.sessionStorage, document:document
      });
      var fetch = function(input, options) {
        var url = new URL(typeof input === "string" ? input : input.url, location.href);
        return url.origin === "https://vgxocngpykhlkosiaeew.supabase.co"
          ? toolAuth.fetch(input, options) : window.fetch(input, options);
      };
    `;
    return source.replace(marker, (match) => match + setup);
  };
})(globalThis);
