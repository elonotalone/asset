// deck-nocturne-01 封面（leoplay-skeleton@2 五槽，交给 cover-frame 沙箱渲染）。
// 它是首页的方幅派生构图：同一套暗场语言（暗底 + 一束灯光 + 潮线 + 单一提亮色），
// 字压在图上，只有两级字。不是占位方块，也不是 pptx 首页的截图。
var W = canvas.width;
var H = canvas.height;

function wrap(ctx, text, maxWidth) {
  var lines = [];
  var line = "";
  for (var i = 0; i < text.length; i++) {
    var next = line + text[i];
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = text[i];
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

var bundle = {
  title: "deck-nocturne-01 cover",
  setup: function () {},
  update: function () {},
  draw: function (ctx) {
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#120B22");
    sky.addColorStop(0.55, "#0C0818");
    sky.addColorStop(1, "#05030B");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    var halo = ctx.createRadialGradient(W * 0.74, H * 0.24, 0, W * 0.74, H * 0.24, H * 0.8);
    halo.addColorStop(0, "rgba(168,85,247,0.42)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    for (var s = 0; s < 200; s++) {
      var sx = (s * 733) % W;
      var sy = ((s * 419) % Math.floor(H * 0.5));
      ctx.fillStyle = "rgba(240,231,255," + (0.1 + ((s * 37) % 40) / 100).toFixed(2) + ")";
      ctx.fillRect(sx, sy, 1, 1);
    }

    var horizon = H * 0.56;
    ctx.fillStyle = "#07050F";
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (var x = 0; x <= W * 0.5; x += W / 24) {
      ctx.lineTo(x, horizon - 22 - Math.abs(Math.sin(x / 130) * 40));
    }
    ctx.lineTo(W * 0.52, horizon);
    ctx.closePath();
    ctx.fill();

    var sea = ctx.createLinearGradient(0, horizon, 0, H);
    sea.addColorStop(0, "#0D0A1C");
    sea.addColorStop(1, "#04030A");
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, W, H - horizon);
    for (var y = horizon + 6; y < H; y += 8) {
      var depth = (y - horizon) / (H - horizon);
      ctx.strokeStyle = "rgba(168,85,247," + (0.05 + depth * 0.2).toFixed(3) + ")";
      ctx.lineWidth = 1 + depth * 1.5;
      ctx.beginPath();
      for (var wx = 0; wx <= W; wx += 12) {
        var wy = y + Math.sin((wx / W) * Math.PI * (2 + depth * 4) + y) * (1 + depth * 5);
        if (wx === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
    }

    var beam = ctx.createLinearGradient(W * 0.16, H * 0.3, W, H * 0.12);
    beam.addColorStop(0, "rgba(192,132,252,0.45)");
    beam.addColorStop(1, "rgba(192,132,252,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(W * 0.16, H * 0.3);
    ctx.lineTo(W, H * 0.02);
    ctx.lineTo(W, H * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(240,231,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W * 0.16, H * 0.54);
    ctx.lineTo(W * 0.16, H * 0.3);
    ctx.stroke();

    // 暗罩：字要压在图上，靠明暗差托起来（本风格唯一的强调手段）
    var scrim = ctx.createLinearGradient(0, H * 0.42, 0, H);
    scrim.addColorStop(0, "rgba(5,3,11,0)");
    scrim.addColorStop(0.45, "rgba(5,3,11,0.72)");
    scrim.addColorStop(1, "rgba(5,3,11,0.92)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.42, W, H * 0.58);

    var pad = W * 0.09;
    ctx.font = Math.round(W * 0.082) + "px CoverSansBold";
    var lines = wrap(ctx, "整夜没有关灯的那条海岸", W - pad * 2);
    var lineHeight = W * 0.104;
    var top = H * 0.66;
    ctx.fillStyle = "#F0E7FF";
    for (var li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], pad, top + li * lineHeight);
    }

    // 一页一个提亮词
    ctx.fillStyle = "#C084FC";
    ctx.fillRect(pad, top + lines.length * lineHeight + W * 0.02, W * 0.14, 4);

    ctx.font = Math.round(W * 0.031) + "px CoverSans";
    ctx.fillStyle = "rgba(240,231,255,0.72)";
    ctx.fillText("夜间海岸观测 · 2026 年度影像汇报", pad, top + lines.length * lineHeight + W * 0.085);
  },
  hud: function () {},
};
