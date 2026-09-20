import Link from "next/link";

const CSS = `
html, body { margin: 0; padding: 0; }
:root { color-scheme: light dark; }

.zq{
  --bg:#F7F8FA;--panel:#FFFFFF;--fg:#0D141A;--dim:#5A6B78;--faint:#7C8C99;--ghost:#A4B2BC;
  --line:#E1E7EC;--line2:#CFD8E0;
  --cobalt:#2E6FE0;--mint:#1E9E82;
  min-height:100vh;width:100%;overflow-x:clip;
  background:var(--bg);color:var(--fg);
  font-family:var(--font-mono),ui-monospace,monospace;
  display:grid;grid-template-rows:auto 1fr auto;
  -webkit-font-smoothing:antialiased;
  transition:background .18s ease,color .18s ease;
}
@media(prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .zq{
    --bg:#0C1116;--panel:#111A21;--fg:#F2F5F7;--dim:#7B8C99;--faint:#4E5F6C;--ghost:#3C4A55;
    --line:#1C262E;--line2:#28343E;
    --cobalt:#5C9BFF;--mint:#4ECBAE;
  }
}
:root[data-theme="dark"] .zq{
  --bg:#0C1116;--panel:#111A21;--fg:#F2F5F7;--dim:#7B8C99;--faint:#4E5F6C;--ghost:#3C4A55;
  --line:#1C262E;--line2:#28343E;
  --cobalt:#5C9BFF;--mint:#4ECBAE;
}
.zq *{box-sizing:border-box;min-width:0;}
.zq a{color:inherit;text-decoration:none;}
.zq :focus-visible{outline:2px solid var(--cobalt);outline-offset:3px;}

.zq-top{position:sticky;top:0;z-index:30;display:flex;justify-content:space-between;
  align-items:center;gap:18px;padding:20px 26px;font-size:12.5px;
  background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);}
@media(max-width:480px){.zq-top{padding:16px 18px;}}
.zq-top-left{display:flex;align-items:center;gap:22px;}
.zq-brand{display:flex;align-items:center;gap:10px;}
.zq-logo{width:28px;height:28px;border-radius:6px;background:var(--cobalt);color:#08121F;
  display:grid;place-items:center;font-family:var(--font-display),sans-serif;font-weight:800;
  font-size:17px;line-height:1;letter-spacing:-.02em;flex:0 0 auto;}
.zq-name{font-family:var(--font-display),sans-serif;font-weight:800;font-size:16px;letter-spacing:-.01em;color:var(--fg);}
.zq-nav{display:flex;gap:20px;color:var(--dim);}
.zq-nav a:hover{color:var(--fg);}
@media(max-width:640px){.zq-nav{display:none;}}
.zq-top-right{display:flex;align-items:center;gap:20px;}
@media(max-width:480px){.zq-top-right{gap:16px;}}
.zq-link{font-family:inherit;background:none;border:0;padding:0;cursor:pointer;color:var(--dim);font-size:inherit;}
.zq-link:hover{color:var(--fg);}
.zq-link-strong{color:var(--fg);}
.zq-link-strong:hover{color:var(--cobalt);}
.zq-theme{background:none;border:0;padding:0;cursor:pointer;color:var(--dim);display:grid;place-items:center;width:16px;height:16px;}
.zq-theme:hover{color:var(--fg);}
.zq-theme svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;}

.zq-mid{display:flex;justify-content:center;padding:22px 26px 64px;}
@media(max-width:480px){.zq-mid{padding:10px 18px 40px;}}
.zq-in{width:100%;max-width:680px;padding-top:38px;}
@media(max-width:480px){.zq-in{padding-top:22px;}}

.zq-mark{font-family:var(--font-display),sans-serif;font-weight:800;font-size:clamp(38px,8vw,68px);
  line-height:1.05;letter-spacing:-.03em;margin:0;text-align:center;}
.zq-mark .dot{color:var(--mint);animation:zqb 1.1s steps(1) infinite;}
@keyframes zqb{0%,50%{opacity:1}51%,100%{opacity:.2}}
.zq-tagline{font-size:clamp(14.5px,3.2vw,17px);color:var(--dim);margin:20px auto 0;letter-spacing:-.01em;
  text-align:center;max-width:52ch;line-height:1.65;}
.zq-tagline b{color:var(--fg);font-weight:600;}

.zq-lead{text-align:center;font-size:11.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--faint);margin:52px 0 18px;}
.zq-icons{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;}
.zq-chip{width:48px;height:48px;border-radius:6px;display:grid;place-items:center;
  border:0;padding:0;cursor:pointer;font:inherit;
  box-shadow:0 1px 0 hsla(0,0%,100%,.14) inset;
  transition:transform .12s ease,opacity .12s ease;}
.zq-chip:hover{transform:translateY(-2px);}
.zq-chip.is-active{outline:2px solid var(--cobalt);outline-offset:3px;}
.zq-chip svg{width:56%;height:56%;}
.zq-chip-name{color:var(--fg);font-weight:600;}
.zq-chip-hint{color:var(--ghost);}
.zq-catalog-note{text-align:center;font-size:12px;color:var(--faint);margin:16px 0 0;}

.zq-connect{margin-top:56px;}
.zq-tabbar{display:flex;gap:4px;justify-content:flex-start;border-bottom:1px solid var(--line);margin:0 0 22px;
  overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.zq-tabbar::-webkit-scrollbar{display:none;}
@media(min-width:640px){.zq-tabbar{justify-content:center;}}
.zq-tab{font-family:inherit;font-size:12px;background:none;border:0;border-bottom:2px solid transparent;
  margin-bottom:-1px;padding:9px 13px;cursor:pointer;color:var(--faint);flex:0 0 auto;white-space:nowrap;}
.zq-tab:hover{color:var(--dim);}
.zq-tab.is-active{color:var(--fg);border-bottom-color:var(--cobalt);}
.zq-tabpanel[hidden]{display:none;}

.zq-cbox{border:1px solid var(--line);border-radius:6px;overflow:hidden;
  background:color-mix(in srgb,var(--fg) 5%,var(--bg));}
.zq-cbox-top{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:9px 14px;border-bottom:1px solid var(--line);}
.zq-cbox-label{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);}
.zq-cbox-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;}
.zq-cbox-row code{font-size:12.5px;color:var(--fg);overflow-x:auto;white-space:nowrap;}
.zq-cbox-block{margin:0;padding:14px 16px;font-size:12px;line-height:1.7;color:var(--fg);
  overflow-x:auto;white-space:pre;}

.zq-copy{font-family:inherit;font-size:11px;background:none;border:1px solid var(--line2);
  border-radius:4px;padding:4px 10px;color:var(--dim);cursor:pointer;flex:0 0 auto;}
.zq-copy:hover{border-color:var(--cobalt);color:var(--fg);}
.zq-cbox-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto;}
.zq-copy-go{display:none;border-color:var(--cobalt);color:var(--cobalt);}
@media(min-width:640px){.zq-copy-go{display:inline-block;}}
.zq-copy-go:hover{background:rgba(92,155,255,.1);color:var(--cobalt);}

.zq-steps{list-style:decimal;margin:18px 0 0;padding-left:20px;color:var(--dim);font-size:12.5px;line-height:1.8;}
.zq-steps b{color:var(--fg);font-weight:600;}
.zq-steps code{font-size:11.5px;color:var(--fg);}
.zq-desk-only{display:none;}
@media(min-width:640px){.zq-desk-only{display:inline;}.zq-mob-only{display:none;}}
.zq-note{font-size:12px;color:var(--faint);margin:16px 0 0;line-height:1.6;}
.zq-note b{color:var(--dim);font-weight:600;}

.zq-universal{text-align:center;font-size:12.5px;color:var(--dim);line-height:1.6;
  margin:28px 0 0;padding-top:22px;border-top:1px solid var(--line);}
.zq-universal a{color:var(--cobalt);}
.zq-universal a:hover{text-decoration:underline;}

.zq-foot{border-top:1px solid var(--line);padding:18px 26px;display:flex;justify-content:space-between;
  align-items:center;gap:10px 18px;flex-wrap:wrap;font-size:11.5px;color:var(--faint);}
@media(max-width:480px){.zq-foot{padding:16px 18px;font-size:11px;}}
.zq-foot-links{display:flex;gap:16px;}
.zq-foot a:hover{color:var(--dim);}

@media(prefers-reduced-motion:reduce){.zq-mark .dot{animation:none;}}
`;

const THEME_TOGGLE_SCRIPT = `
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('themeBtn');
  var SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>';

  function effective() {
    var stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function paint() {
    var mode = effective();
    btn.innerHTML = mode === 'dark' ? SUN : MOON;
    btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  btn.addEventListener('click', function () {
    var next = effective() === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    root.setAttribute('data-theme', next);
    paint();
  });

  paint();
  document.getElementById('footYear').textContent = '© ' + new Date().getFullYear() + ' Zeqqat';
})();
`;

const INTERACTIONS_SCRIPT = `
(function () {
  var icons = document.getElementById('zqIcons');
  var info = document.getElementById('zqChipInfo');
  if (icons && info) {
    var HINT = '<span class="zq-chip-hint">Tap a logo to see what it does</span>';
    var pinned = null;

    function show(chip) {
      info.innerHTML = '<span class="zq-chip-name">' + chip.getAttribute('data-name') + '</span> &middot; '
        + chip.getAttribute('data-desc');
    }
    function reset() {
      if (pinned) { show(pinned); } else { info.innerHTML = HINT; }
    }

    icons.addEventListener('click', function (e) {
      var chip = e.target.closest('.zq-chip');
      if (!chip) return;
      if (pinned === chip) {
        pinned = null;
        chip.classList.remove('is-active');
      } else {
        if (pinned) pinned.classList.remove('is-active');
        pinned = chip;
        chip.classList.add('is-active');
      }
      reset();
    });

    icons.addEventListener('mouseover', function (e) {
      var chip = e.target.closest('.zq-chip');
      if (chip) show(chip);
    });
    icons.addEventListener('mouseout', function (e) {
      if (!icons.contains(e.relatedTarget)) reset();
    });
    icons.addEventListener('focusin', function (e) {
      var chip = e.target.closest('.zq-chip');
      if (chip) show(chip);
    });
    icons.addEventListener('focusout', reset);
  }

  var tabbar = document.querySelector('.zq-tabbar');
  if (tabbar) {
    tabbar.addEventListener('click', function (e) {
      var tab = e.target.closest('.zq-tab');
      if (!tab) return;
      var target = tab.getAttribute('data-tab');
      document.querySelectorAll('.zq-tab').forEach(function (b) {
        b.classList.toggle('is-active', b === tab);
      });
      document.querySelectorAll('.zq-tabpanel').forEach(function (p) {
        p.hidden = p.getAttribute('data-panel') !== target;
      });
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.zq-copy');
    if (!btn) return;
    var text = btn.getAttribute('data-copy') || '';
    function settle(ok) {
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { settle(true); }, function () { settle(false); });
    } else {
      settle(false);
    }
  });
})();
`;

const CURSOR_CONFIG = `{
  "mcpServers": {
    "zeqqat": {
      "url": "https://zeqqat.com/mcp"
    }
  }
}`;

const VSCODE_CONFIG = `{
  "servers": {
    "zeqqat": {
      "type": "http",
      "url": "https://zeqqat.com/mcp"
    }
  }
}`;

export default function GatewayLanding() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="zq">
        <header className="zq-top">
          <div className="zq-top-left">
            <Link href="/" className="zq-brand" aria-label="Zeqqat home">
              <span className="zq-logo" aria-hidden="true">
                Z
              </span>
              <span className="zq-name">zeqqat</span>
            </Link>
            <nav className="zq-nav" aria-label="Main">
              <a href="#how">How it works</a>
              <a href="#docs">Self-host</a>
              <a href="#docs">Docs</a>
            </nav>
          </div>
          <div className="zq-top-right">
            <a className="zq-link" href="#signin">
              Sign in
            </a>
            <a className="zq-link zq-link-strong" href="#signup">
              Sign up
            </a>
            <button className="zq-theme" id="themeBtn" aria-label="Switch theme"></button>
          </div>
        </header>

        <div className="zq-mid">
          <main className="zq-in" id="main">
            <h1 className="zq-mark">
              One endpoint for
              <br />
              all your MCP servers<span className="dot">.</span>
            </h1>
            <p className="zq-tagline">
              Connect once and reach every MCP server you&rsquo;ve integrated. See what your agents
              are doing, decide what they&rsquo;re allowed to do, and extend the same access to your
              team. Bring any agent: <b>Claude</b>, <b>Cursor</b>, <b>ChatGPT</b>, or your own.
            </p>

            <p className="zq-lead">Integrated MCP servers</p>
            <div className="zq-icons" id="zqIcons">
              <button
                className="zq-chip"
                style={{ background: "#12141A" }}
                type="button"
                data-name="Dokploy"
                data-desc="Deploy apps, manage projects and read logs"
                aria-label="Dokploy"
              >
                <svg viewBox="0 0 6323 5778" xmlns="http://www.w3.org/2000/svg" fill="#fff">
                  <path d="M4638.51 44.5295C4616.52 81.8286 4611.45 115.575 4619.9 213.263C4636.82 433.505 4772.12 710.584 4924.33 842.019C5002.12 909.512 5196.61 1012.53 5245.66 1012.53C5284.56 1012.53 5282.87 1019.63 5213.53 1129.75C5140.8 1243.43 5024.11 1339.34 4890.5 1389.07C4743.36 1445.91 4455.85 1453.01 4234.3 1405.06C4016.13 1357.1 3931.57 1323.35 3211.11 977.006C2265.71 522.312 2253.87 516.984 2125.34 481.461C2017.1 451.267 1917.32 445.938 1316.93 435.281C853.533 428.177 601.539 429.953 538.964 444.162C334.325 485.013 156.745 632.434 70.4925 829.586C12.9907 961.021 -7.30411 1191.92 2.84328 1589.78C7.91697 1841.99 16.3731 1911.26 46.8153 2005.39C114.465 2213.2 226.086 2342.86 422.269 2445.88C1594.29 3055.1 1969.74 3206.07 2529.54 3294.88C2732.49 3326.85 3258.46 3330.4 3459.72 3303.76C3755.69 3261.13 4107.46 3161.66 4403.43 3033.78C4540.42 2975.17 4904.03 2776.24 5220.29 2587.97C5910.31 2177.68 6006.71 2111.96 6037.16 2030.26C6070.98 1934.35 5988.11 1811.79 5888.33 1811.79C5851.12 1811.79 5862.96 1806.47 5426.62 2069.34C4352.69 2715.85 4026.28 2865.05 3485.09 2957.41C3162.06 3014.24 2587.04 2987.6 2274.17 2902.35C1924.08 2806.44 1839.52 2770.91 1051.41 2383.71C552.493 2140.38 444.255 2079.99 395.209 2023.16C363.076 1984.08 336.016 1945.01 336.016 1934.35C336.016 1920.14 467.932 1916.59 787.575 1921.92L1240.82 1929.02L1435.32 2001.84C1541.86 2040.92 1744.81 2126.17 1883.49 2190.11C2296.15 2381.94 2610.72 2451.21 3058.9 2451.21C3490.16 2451.21 3872.38 2374.83 4305.33 2198.99C4910.8 1955.66 5342.06 1596.88 5545.01 1172.38C5565.3 1127.98 5585.6 1090.68 5587.29 1087.13C5590.67 1083.57 5660.01 1074.69 5742.88 1065.81C5940.76 1046.28 6084.51 978.782 6221.5 842.019L6322.97 740.779V520.536V302.071L6253.63 353.579C6177.53 412.192 6062.52 444.162 5920.46 444.162C5795.31 444.162 5661.7 508.104 5568.69 614.672L5497.65 692.823L5487.51 646.643C5451.99 500.999 5304.85 364.236 5115.44 300.294C4956.46 248.786 4893.88 206.159 4831.31 108.471C4800.87 64.0671 4770.42 21.4395 4760.28 14.335C4721.38 -14.0833 4665.57 1.90186 4638.51 44.5295ZM2057.69 806.496C2162.55 834.914 2250.49 873.99 2517.7 1007.2C2605.65 1051.6 2796.76 1142.19 2940.51 1211.46C3084.27 1280.73 3332.88 1397.95 3490.16 1472.55C3948.49 1691.02 4049.96 1726.54 4301.95 1754.96L4437.25 1770.94L4310.41 1833.11C4153.12 1911.26 4016.13 1960.99 3804.73 2016.05C3512.15 2090.65 3402.22 2104.86 3050.44 2104.86C2590.43 2103.08 2370.57 2056.9 1974.82 1872.18C1413.33 1611.09 1386.27 1603.99 801.104 1589.78C457.784 1580.9 356.311 1572.01 336.016 1552.48C278.514 1492.09 303.882 1019.63 373.223 914.841C412.121 854.452 474.697 806.496 552.493 779.854C577.862 770.973 904.27 767.421 1278.03 772.749C1814.15 778.078 1978.2 785.182 2057.69 806.496Z" />
                  <path d="M1266.2 1060.49C1173.18 1097.79 1129.21 1207.91 1171.49 1294.94C1222.22 1394.4 1332.15 1417.49 1413.33 1342.89C1477.6 1286.06 1479.29 1174.16 1418.41 1112C1374.44 1065.82 1308.48 1042.73 1266.2 1060.49Z" />
                  <path d="M87.4063 2513.37C7.91846 2548.89 -8.99385 2616.39 4.536 2836.63C19.7571 3072.86 46.8168 3222.05 124.613 3488.48C427.344 4532.85 1129.2 5287.71 2106.74 5623.4C2641.17 5806.35 3236.48 5827.66 3752.3 5682.01C4596.23 5445.79 5315 4836.57 5692.15 4040.86C5886.64 3630.57 6018.55 3111.93 6018.55 2753.15C6018.55 2582.64 5991.49 2518.7 5910.31 2497.39C5820.68 2474.3 5575.45 2609.28 5164.48 2911.23C4484.61 3410.32 4229.23 3563.07 3890.98 3676.75C3635.61 3763.78 3466.49 3797.52 3194.2 3818.84C2651.31 3863.24 2057.69 3731.81 1570.62 3458.28C1394.73 3358.82 846.769 2980.5 581.246 2772.69C285.28 2540.01 270.059 2529.36 199.028 2508.04C155.056 2495.61 124.613 2497.39 87.4063 2513.37ZM5678.62 3076.41C5661.7 3138.57 5646.48 3202.52 5646.48 3218.5C5646.48 3236.26 5626.19 3262.9 5600.82 3280.67C5573.76 3296.65 5482.43 3371.25 5396.18 3445.85C5308.24 3518.67 5198.31 3611.03 5150.95 3650.1C5101.91 3689.18 4990.28 3781.54 4902.34 3856.14C4699.39 4026.65 4406.81 4236.23 4242.76 4330.37C4085.48 4420.95 3767.52 4532.85 3532.44 4582.58C2847.5 4724.67 2054.31 4570.15 1516.5 4190.05C1173.18 3946.72 412.123 3314.41 388.445 3254.02C363.077 3182.98 330.944 3042.66 337.708 3021.35C341.091 3012.47 417.196 3060.42 505.14 3129.69C1056.48 3559.52 1563.85 3863.24 1942.69 3992.9C2328.29 4124.34 2565.06 4163.41 2991.25 4163.41C3380.23 4163.41 3628.84 4126.11 3963.71 4012.44C4345.93 3884.56 4531.96 3781.54 5052.86 3405C5391.11 3161.66 5676.92 2968.06 5700.6 2966.29C5705.68 2966.29 5697.22 3016.02 5678.62 3076.41ZM5426.62 3881C5426.62 3886.33 5409.71 3925.41 5391.11 3966.26C5318.38 4115.45 5144.19 4364.11 5003.81 4518.64C4587.77 4973.33 4090.55 5271.73 3540.9 5392.5C3309.2 5444.01 2708.81 5440.46 2483.88 5387.17C1716.06 5204.23 1105.53 4754.87 696.249 4071.05C647.204 3987.57 609.997 3916.53 613.379 3912.97C616.762 3909.42 774.046 4028.42 965.155 4177.62C1154.57 4326.82 1371.05 4486.67 1443.77 4532.85C1974.82 4863.21 2463.59 4991.09 3118.09 4968C3461.41 4955.57 3691.42 4912.94 3997.53 4806.38C4357.76 4680.27 4623.29 4513.31 5130.66 4095.92C5382.65 3888.11 5426.62 3856.14 5426.62 3881Z" />
                </svg>
              </button>
              <button
                className="zq-chip"
                style={{ background: "#F38020" }}
                type="button"
                data-name="Cloudflare"
                data-desc="DNS, tunnels, Workers and cache control"
                aria-label="Cloudflare"
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="#fff">
                  <path d="M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727" />
                </svg>
              </button>
            </div>
            <p className="zq-catalog-note" id="zqChipInfo">
              <span className="zq-chip-hint">Tap a logo to see what it does</span>
            </p>

            <div className="zq-connect" id="how">
              <p className="zq-lead" style={{ margin: "0 0 18px" }}>
                Connect your agent
              </p>

              <div className="zq-tabbar" role="tablist" aria-label="Choose your agent">
                <button className="zq-tab is-active" data-tab="claude" type="button">
                  Claude
                </button>
                <button className="zq-tab" data-tab="claudecode" type="button">
                  Claude Code
                </button>
                <button className="zq-tab" data-tab="cursor" type="button">
                  Cursor
                </button>
                <button className="zq-tab" data-tab="chatgpt" type="button">
                  ChatGPT
                </button>
                <button className="zq-tab" data-tab="vscode" type="button">
                  VS Code
                </button>
                <button className="zq-tab" data-tab="other" type="button">
                  Other
                </button>
              </div>

              <div className="zq-tabpanel" data-panel="claude">
                <div className="zq-cbox">
                  <div className="zq-cbox-top">
                    <span className="zq-cbox-label">MCP server URL</span>
                  </div>
                  <div className="zq-cbox-row">
                    <code>https://zeqqat.com/mcp</code>
                    <span className="zq-cbox-actions">
                      <a
                        className="zq-copy zq-copy-go"
                        href="https://claude.ai/new?modal=add-custom-connector&connectorName=Zeqqat&connectorUrl=https%3A%2F%2Fzeqqat.com%2Fmcp#settings/customize-connectors"
                      >
                        Add to Claude
                      </a>
                      <button className="zq-copy" data-copy="https://zeqqat.com/mcp" type="button">
                        Copy
                      </button>
                    </span>
                  </div>
                </div>
                <ol className="zq-steps">
                  <li>
                    <span className="zq-desk-only">
                      Click <b>Add to Claude</b>, or open{" "}
                    </span>
                    <span className="zq-mob-only">Open </span>
                    <b>Settings &rarr; Connectors &rarr; Add custom connector</b> and paste the URL
                  </li>
                  <li>Review the URL and click <b>Add</b></li>
                  <li>Sign in when the browser opens</li>
                </ol>
                <p className="zq-note">
                  On Team and Enterprise plans, an Owner adds Zeqqat once under{" "}
                  <b>Organization settings &rarr; Connectors</b>. Members then connect to it individually.
                </p>
              </div>

              <div className="zq-tabpanel" data-panel="claudecode" hidden>
                <div className="zq-cbox">
                  <div className="zq-cbox-top">
                    <span className="zq-cbox-label">Terminal</span>
                  </div>
                  <div className="zq-cbox-row">
                    <code>claude mcp add --transport http zeqqat https://zeqqat.com/mcp</code>
                    <button
                      className="zq-copy"
                      data-copy="claude mcp add --transport http zeqqat https://zeqqat.com/mcp"
                      type="button"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <ol className="zq-steps">
                  <li>Run the command in your terminal</li>
                  <li>
                    Start a session and run <code>/mcp</code>
                  </li>
                  <li>
                    Select <b>zeqqat</b>, choose <b>Authenticate</b>, and sign in
                  </li>
                </ol>
                <p className="zq-note">
                  No API key to manage. Works the same in the terminal, VS Code, and the desktop Code tab.
                </p>
              </div>

              <div className="zq-tabpanel" data-panel="cursor" hidden>
                <div className="zq-cbox">
                  <div className="zq-cbox-top">
                    <span className="zq-cbox-label">~/.cursor/mcp.json</span>
                    <button className="zq-copy" data-copy={CURSOR_CONFIG} type="button">
                      Copy
                    </button>
                  </div>
                  <pre className="zq-cbox-block">
                    <code>{CURSOR_CONFIG}</code>
                  </pre>
                </div>
                <ol className="zq-steps">
                  <li>
                    Add the block to <code>~/.cursor/mcp.json</code>, or use{" "}
                    <b>Settings &rarr; MCP &rarr; Add new MCP server</b>
                  </li>
                  <li>Open MCP settings and authorize when prompted</li>
                  <li>A green dot means the tools are live in Agent mode</li>
                </ol>
                <p className="zq-note">
                  Use <code>.cursor/mcp.json</code> in a project instead to share it with your team.
                </p>
              </div>

              <div className="zq-tabpanel" data-panel="chatgpt" hidden>
                <div className="zq-cbox">
                  <div className="zq-cbox-top">
                    <span className="zq-cbox-label">MCP server URL</span>
                  </div>
                  <div className="zq-cbox-row">
                    <code>https://zeqqat.com/mcp</code>
                    <button className="zq-copy" data-copy="https://zeqqat.com/mcp" type="button">
                      Copy
                    </button>
                  </div>
                </div>
                <ol className="zq-steps">
                  <li>
                    Open <b>Settings &rarr; Apps &amp; Connectors &rarr; Advanced</b> and turn on{" "}
                    <b>Developer Mode</b>
                  </li>
                  <li>
                    Back in Apps &amp; Connectors, click <b>Create</b> and paste the URL
                  </li>
                  <li>
                    Leave authentication on <b>OAuth</b> and sign in
                  </li>
                </ol>
                <p className="zq-note">
                  Custom connectors need a paid plan. Developer Mode is a one-time switch per account.
                </p>
              </div>

              <div className="zq-tabpanel" data-panel="vscode" hidden>
                <div className="zq-cbox">
                  <div className="zq-cbox-top">
                    <span className="zq-cbox-label">.vscode/mcp.json</span>
                    <button className="zq-copy" data-copy={VSCODE_CONFIG} type="button">
                      Copy
                    </button>
                  </div>
                  <pre className="zq-cbox-block">
                    <code>{VSCODE_CONFIG}</code>
                  </pre>
                </div>
                <ol className="zq-steps">
                  <li>
                    Create <code>.vscode/mcp.json</code> and add the block
                  </li>
                  <li>Start the server from the editor and authorize when prompted</li>
                  <li>The tools appear in Agent mode</li>
                </ol>
              </div>

              <div className="zq-tabpanel" data-panel="other" hidden>
                <div className="zq-cbox">
                  <div className="zq-cbox-top">
                    <span className="zq-cbox-label">MCP server URL</span>
                  </div>
                  <div className="zq-cbox-row">
                    <code>https://zeqqat.com/mcp</code>
                    <button className="zq-copy" data-copy="https://zeqqat.com/mcp" type="button">
                      Copy
                    </button>
                  </div>
                </div>
                <ol className="zq-steps">
                  <li>Point any MCP-compatible client at the URL over streamable HTTP</li>
                  <li>Authorize through OAuth when prompted</li>
                  <li>Every tool you&rsquo;ve enabled shows up in that client</li>
                </ol>
                <p className="zq-note">Same endpoint everywhere. Only the way you enter it changes.</p>
              </div>
            </div>

            <p className="zq-universal">
              Self-hosting works the same way. Connect above, then ask Zeqqat to set up your instance. It
              walks you through it and hands you your own URL at the end.
            </p>
          </main>
        </div>

        <footer className="zq-foot">
          <span id="footYear">© 2026 Zeqqat</span>
          <nav className="zq-foot-links" aria-label="Footer">
            <a href="#docs">Self-host</a>
            <a href="#docs">Docs</a>
          </nav>
        </footer>
      </div>

      <script dangerouslySetInnerHTML={{ __html: THEME_TOGGLE_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: INTERACTIONS_SCRIPT }} />
    </>
  );
}
