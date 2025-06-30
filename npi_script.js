; (function ($) {
  'use strict';

  console.log('━━━━━━━━━━ FULL RELOAD ━━━━━━━━━━');

  // #region 🟩 CONSTANTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Local Storage Keys: These key values are stored in local storage (is retained on browser close, stored per origin basis)
  const KEY_DUAL_NAV = 'key_dual_nav'; // key by which dual nav or single nav data is stored in local storage
  const KEY_PRI_WIDTH = 'key_pri_width'; // key by which width of the primary pane of dual nav is stored in local storage
  const KEY_SEC_WIDTH = 'key_sec_width'; // key by which width of the secondary pane of dual nav is stored in local storage

  // Session Storage Keys: These key values are stored in session storage (gets cleared when tab is closed but retains on reload)
  const KEY_GEN_DATA = 'key_gen_data'; // key by which the doxygen generation time is stored in session storage
  const KEY_PRI_TREE = 'key_pri_tree'; // key by which primary tree for dual nav is stored in session storage
  const KEY_PRI_TREE_DISCARDED = 'key_pri_tree_discarded'; // key by which discarded tree data (what is not in primary tree for dual nav) is stored in session storage
  const KEY_PRI_NAV_EXPANDED_NODES = 'key_pri_nav_expanded_nodes'; // key by which primary nav's already expanded nodes are stored in session storage

  // Constant Values
  const MAX_ATTEMPTS = 50; // Allowed max attempts for a rerun when something is not found in the initial run
  const ICON_SIDE_NAV = 'icon_side_nav.png'; // name for the icon that shows the default side nav symbol
  const ICON_DUAL_NAV = 'icon_dual_nav.png'; // name for the icon that shows the dual nav symbol
  const MIN_W = 25; // minimum width of either primary or secondary nav panes in dual nav configuration
  const GUTTER_W = 100; // right side gutter width in dual nav configuration
  const MEDIA_QUERY_WIN_WIDTH = window.matchMedia('(min-width: 768px)'); // a MediaQueryList for “min-width: 768px”, later used to set the correct layout

  const DOC_ROOT = (() => {
    // Determine the base path (DOC_ROOT) of the current documentation site.
    // This is useful for loading assets (e.g., CSS/JS) relative to the script location,
    // even when the script is located in a nested folder or executed in varied contexts.
    // ⚠️ NOTE: This is a IIFE (Immediately Invoked Function Expression) and it runs immediately
    // at defination time and the resulting string is stored in DOC_ROOT. Every time DOC_ROOT
    // is referenced afterward, it is getting that cached value, not re-running the function.

    // Helper function: Extracts the folder path from a full URL.
    // Example: "https://example.com/docs/js/script.js" -> "https://example.com/docs/js/"
    // Example: "file:///F:/Doxy/Z_Test/Test_5/html/script.js" -> "file:///F:/Doxy/Z_Test/Test_5/html/"
    const getDir = src => src.slice(0, src.lastIndexOf('/') + 1);
    // Primary method: Use 'document.currentScript' to get the <script> element currently executing.
    // This is the most accurate and modern way to locate the script's own path.
    const self = document.currentScript;
    if (self && self.src) {
      let dir = getDir(self.src); // The folder path of the script itself.
      return dir;
    }

    // Fallback: If 'currentScript' is unavailable (e.g., in older browsers or dynamic environments),
    // try to locate a known Doxygen-generated script like 'navtreedata.js'.
    // This file typically resides in the root documentation folder.
    const tree = document.querySelector('script[src$="navtreedata.js"]');
    if (tree && tree.src) {
      let dir = getDir(tree.src); // The folder path where 'navtreedata.js' is located.
      console.warn(`Root: ${dir} (Determined by navtreedata.js file)`);
      return dir;
    }

    // Final fallback: If both methods fail, fall back to the root of the current origin.
    // Example: If on "https://example.com/docs/page.html", this gives "https://example.com/"
    // ⚠️ NOTE: This will result in "file://" when opened directly from folder
    const dir = window.location.origin + '/';
    console.error(`Root: ${dir} (Ultimate Fallback)`);
    return dir;
  })();

  const IS_CLASS_OR_STRUCT_PAGE = (() => {
    // Determines if the current page is for a class or struct. If it is then its member signatures
    // will be shown in the secondary nav if dual nav is set to true. This value is used in the
    // function that generates member signatures to determine if it should run ot not.
    // ⚠️ NOTE: This is a IIFE (Immediately Invoked Function Expression) and it runs immediately
    // at defination time and the resulting string is stored in IS_CLASS_OR_STRUCT_PAGE. Every time
    // IS_CLASS_OR_STRUCT_PAGE is referenced afterwards, it is getting the cached value.
    const lastPart = window.location.pathname.split('/').pop().toLowerCase(); // grab last segment of the path after last /
    return lastPart.startsWith('class') || lastPart.startsWith('struct'); // test for “class…” or “struct…” at the very start of last segment
  })();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 CONSTANTS

  // #region 🟩 GLOBAL VARIABLES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  let _dualNav = (localStorage.getItem(KEY_DUAL_NAV) === 'true');
  let _priTree = [];
  let _secTree = [];
  let _priTreeDiscarded = [];
  let _secTreeRemarks = '';
  let _wPri = loadNumLocalStorage(KEY_PRI_WIDTH, 250);
  let _wSec = loadNumLocalStorage(KEY_SEC_WIDTH, 250);

  let _adjustXandH_resizeObserver = null;
  let _docMarginStableFrames = 0;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 GLOBAL VARIABLES

  // #region 🟩 HELPERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function debounce(fn, ms) {
    // A way to “coalesce” a rapid burst of events into a single call after things have settled down.
    let t;                                   // holds the pending timeout ID
    return (...args) => {                    // returns a wrapped version of `fn`
      clearTimeout(t);                       // cancel any previous scheduled call
      t = setTimeout(() => fn(...args), ms); // schedules a new call with latest args after 'ms' milliseconds
    };
  }

  function rerun(stepFn, attempt, ...args) {
    // Schedule the next animation frame up to MAX_ATTEMPTS,
    // passing along any extra arguments to stepFn.
    // ⚠️ The function should take first parameter as next attempt index
    // and then there can none or any number of parameters
    // Returns: The RAF ID, or null if you aborted.
    if (attempt < MAX_ATTEMPTS) {
      return requestAnimationFrame(() => stepFn(attempt + 1, ...args));
    }
    else {
      console.error(`${stepFn.name || 'callback'} [${attempt}]: Exceeded max attempts; aborting.`);
      return null;
    }
  }

  function waitFor(selector, timeout = 2000) {
    // Waits for the first element matching any CSS selector.
    // selector: Any valid querySelector string.
    // timeout: ms before rejecting (default 1 second).
    // Returns: Promise<Element>

    return new Promise((resolve, reject) => {
      // Immediate hit?
      const el = document.querySelector(selector);
      if (el) {
        //console.log(`Selector "${selector}" found immediately, no need for mutation observer`);
        return resolve(el);
      }

      // Otherwise observe mutations until we find one
      // In MutationObserver, first argument '_' is an
      // intentionally unused parameter, by using '_'
      // it means we are watching for any change. The
      // second argument 'observer' is the own 'obs'
      // instance.
      const obs = new MutationObserver((_, observer) => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          //console.log(`Selector "${selector}" found in mutation observer, Task Complete!`);
          resolve(found);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      // Give up after timeout
      if (timeout > 0) {
        setTimeout(() => {
          obs.disconnect();
          reject(new Error(`Timed out waiting for selector "${selector}"`));
        }, timeout);
      }
    });
  }

  function waitForId(id, timeout = 2000) {
    // Waits for an element with the given ID.
    // id: The element’s id attribute (without the “#”).
    // timeout: ms before rejecting (default 1 second).
    // Returns: Promise<Element>

    // fast path
    const el = document.getElementById(id);
    if (el) {
      //console.log(`Element "#${id}" found immediately, no need for mutation observer`);
      return Promise.resolve(el);
    }
    // fall back to the generic waitFor
    return waitFor(`#${id}`, timeout);
  }

  function waitForClass(className, timeout = 2000) {
    // Waits for one or more elements with the given class.
    // className: The class name (without the “.”).
    // timeout: ms before rejecting (default 1 second).
    // Returns: Promise<Element[]> i.e. resolves with an array of matching elements

    return new Promise((resolve, reject) => {
      // fast path
      const initial = document.getElementsByClassName(className);
      if (initial.length) {
        return resolve(Array.from(initial));
      }

      // observe until we see at least one
      const obs = new MutationObserver((_, observer) => {
        const found = document.getElementsByClassName(className);
        if (found.length) {
          observer.disconnect();
          resolve(Array.from(found));
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      // give up after timeout
      if (timeout > 0) {
        setTimeout(() => {
          obs.disconnect();
          reject(new Error(`Timed out waiting for class ".${className}"`));
        }, timeout);
      }
    });
  }

  function printTree(tree, level = 0) {
    // Prints a nested array, the array is supposed to be of the type [name, href, kids] where kids can be another array
    if (!Array.isArray(tree)) {
      console.error('Print Tree: Passed tree is not an array');
      return;
    }
    const indent = ' '.repeat(level * 3);
    const palette = ['red', 'green', 'orange', 'teal', 'blue', 'purple'];
    const txtClr = palette[level % palette.length];
    tree.forEach(([name, href, kids]) => {
      if (Array.isArray(kids)) {
        if (kids.length > 0) {
          console.log(`%c${indent}${name} → ${href} → Kids: ${kids.length}`, `color: ${txtClr}`);
          printTree(kids, level + 1);
        }
        else {
          console.log(`%c${indent}${name} → ${href} → Kids: 0`, `color: ${txtClr}`);
        }
      }
      else {
        console.log(`%c${indent}${name} → ${href} → ${kids}`, `color: ${txtClr}`);
      }
    });
  }

  function loadNumLocalStorage(key, def) {
    // Load Number From Local Storage
    const v = localStorage.getItem(key);
    return v !== null ? parseInt(v, 10) : def;
  }

  function saveValLocalStorage(key, val) {
    // Save Value to Local Storage
    localStorage.setItem(key, String(val));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 HELPERS

  // #region 🟩 SEARCH PLACEHOLDER TWEAK
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function searchPlaceholderTweak() {

    async function update() {
      const field = await waitFor('#MSearchField');
      if (!field || !window.searchBox || !window.indexSectionLabels) {
        console.error('Search Placeholder Tweak - Update: Required members are not available');
        return;
      }
      const label = window.indexSectionLabels[window.searchBox.searchIndex] || 'All';
      field.setAttribute('placeholder', `Search ${label}`);
      //console.log(`Search Placeholder Tweak - Update: SUCCESS "Search ${label}"`);
    }

    //await update(); // no need to call here, the window.searchBox.OnSelectItem is triggered automatically the first time

    // Run the update again when user changes the from search dropdown
    if (window.searchBox && window.searchBox.OnSelectItem && typeof window.searchBox.OnSelectItem === 'function') {
      const orig = window.searchBox.OnSelectItem;
      window.searchBox.OnSelectItem = function (id) {
        const ret = orig.call(this, id);
        //console.log('Search Placeholder Tweak - Search Box On Select Item Triggered');
        update();
        return ret;
      };
    }

    // The search bar updates when resizing, so listen to it, debounce till it settles and then call updatePlaceholder
    // ⚠️ NOTE: debounce is needed because without it the update function runs but the placeholder remains not update
    // on resize. I think this is because without debounce the placeholder is updated very fast and afterwards the
    // searchbox itself is re-created by Doxygen or Doxygen Awesome theme thus removing the updated placeholder text.
    window.addEventListener('resize', debounce(update, 50));
    //console.log('Search Placeholder Tweak: SUCCESS');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 SEARCH PLACEHOLDER

  // #region 🟩 SIDE NAV TWEAK
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function sideNavTweak() {

    // We have to wait for the two parts and we do it simultaneously by using 'await Promise.all...'
    const sideNavPromise = waitFor('#side-nav');
    const firstLiPromise = waitFor('#side-nav #nav-tree-contents ul > li, #side-nav #nav-tree ul > li');
    const [sideNav, firstLi] = await Promise.all([sideNavPromise, firstLiPromise]);
    const sideNavTreeUl = firstLi.parentElement; // now we know the UL exists and has at least one LI

    // Bump all childs of the top level item to the top lebvel then remove the original top level
    // item which will be empty now. This is done because the default navigation tree generated by
    // Doxygen has only one top top level item (usually called "Main Page") and its children are
    // items like "Namespaces", "Concepts", "Classes", etc. Having only one top level item seems
    // useless, so I remove it and have all its child as top level items.
    // ⚠️ NOTE: If in future the top level item is needed then just comment out the below part.
    const nested = firstLi.querySelector('ul');
    if (nested) {
      for (const li of Array.from(nested.children)) { // for…of gives you callback-free, breakable loops
        sideNavTreeUl.appendChild(li);
      }
    }
    firstLi.remove();

    // This function swaps ►/▼ for ●/○ everywhere. By default Doxygen does not populate all
    // childs in the nav tree, only when a node is expanded that its children are shown. What below
    // section does is to listen to when the side-nav is changed i.e. a node is expanded/collapsed
    // then swaps ►/▼ for ●/○. This way the icons for expand/collapse is always ●/○.
    function replaceArrows() {
      mo.disconnect();
      sideNav.querySelectorAll('span.arrow').forEach(span => {
        const t = span.textContent.trim();
        if (t === '►') span.textContent = '\u25CF\uFE0F';
        else if (t === '▼') span.textContent = '\u25CB\uFE0F';
      });
      //console.log('Side Nav Tweak - Replace Arrows: SUCCESS');
      mo.observe(sideNav, { childList: true, subtree: true });
    }
    const mo = new MutationObserver(replaceArrows);
    replaceArrows(); // replace arrows initially

    //console.log('Side Nav Tweak: SUCCESS');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 SIDE NAV TWEAK

  // #region 🟩 NAV TOGGLE BUTTON
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function navToggleButton() {
    const itemSearchBox = await waitFor('#searchBoxPos2');
    function setup() {
      mo.disconnect();
      const winWidth = window.innerWidth || document.documentElement.clientWidth;
      if (winWidth >= 768) {
        let btn = itemSearchBox.querySelector('.npi-nav-toggle-btn');
        if (btn) {
          itemSearchBox.appendChild(btn);
          const icon = btn.querySelector("img");
          icon.src = DOC_ROOT + (_dualNav ? ICON_DUAL_NAV : ICON_SIDE_NAV);
          //console.log('Nav Toggle Button - Setup: Reposition');
        }
        else {
          btn = document.createElement('a');
          btn.className = 'npi-nav-toggle-btn';
          btn.href = '#';
          btn.title = 'Toggle Single/Double Navigation Sidebar';

          const img = document.createElement('img');
          img.width = 24;
          img.height = 24;
          img.alt = 'Dual Sidebar Toggle Icon';
          img.src = DOC_ROOT + (_dualNav ? ICON_DUAL_NAV : ICON_SIDE_NAV);
          btn.appendChild(img);

          btn.addEventListener('click', evt => {
            evt.preventDefault();
            _dualNav = !_dualNav;
            img.src = DOC_ROOT + (_dualNav ? ICON_DUAL_NAV : ICON_SIDE_NAV);
            localStorage.setItem(KEY_DUAL_NAV, _dualNav ? 'true' : 'false');
            setCorrectLayout(MEDIA_QUERY_WIN_WIDTH);
            //console.log(`Nav Toggle Button - Click: DualNav = ${_dualNav}`);
          });

          itemSearchBox.appendChild(btn);
          //console.log('Nav Toggle Button - Setup: New Button');
        }
      }
      else {
        //console.log('Nav Toggle Button - Setup: Width < 768');
      }
      mo.observe(itemSearchBox, { childList: true });
    }
    const mo = new MutationObserver(setup);
    //mo.observe(itemSearchBox, { childList: true });
    setup();
    //console.log('Nav Toggle Button: SUCCESS');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 NAV TOGGLE BUTTON

  // #region 🟩 GEN SEC TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function genSecTree() {

    _secTree.length = 0;
    _secTreeRemarks = '';

    if (!IS_CLASS_OR_STRUCT_PAGE) {
      _secTreeRemarks = 'Not a Class or Struct Page';
      //console.log('Gen Sec Tree: Not a Class or Struct Page');
      return;
    }

    let contents = null;
    try {
      contents = await waitFor('div.contents, div.content, main');
    }
    catch (err) {
      console.error('Gen Sec Tree: Error waiting for "div.contents, div.content, main"', err);
      return;
    }

    if (contents == null) {
      console.error(`Gen Sec Tree: "div.contents, div.content, main" not found`);
      return;
    }

    const tables = Array.from(contents.querySelectorAll("table.memberdecls"));
    if (tables.length === 0) {
      _secTreeRemarks = 'Empty "table.memberdecls" element array';
      //console.log('Gen Sec Tree: Empty "table.memberdecls" element array');
      return;
    }

    const headers = Array.from(contents.querySelectorAll("h2.groupheader"));
    tables.forEach((table, idx) => {
      const grpSigs = [];
      const seenName = new Set();
      const seenHref = new Set();

      const headName = headers[idx]?.textContent.trim() || `Members ${idx + 1}`;

      const headerEl = headers[idx];
      const anchorEl = headerEl.querySelector("a[id], a[name]");
      const anchorId = anchorEl?.getAttribute("id") || anchorEl?.getAttribute("name") || null;
      const headHref = anchorId ? `#${anchorId}` : null;

      table.querySelectorAll("a[href^='#']").forEach(a => {
        if (a.closest("div.memdoc") || a.closest("td.mdescRight")) return;

        const leafHref = a.getAttribute("href");
        if (seenHref.has(leafHref)) {
          return;
        }

        const row = a.closest("tr");
        if (!row) {
          return;
        }
        const tds = row.querySelectorAll("td");
        if (tds.length < 2) {
          return;
        }

        const lftText = tds[0].innerText.replace(/\s+/g, ' ').trim();
        const ritText = tds[1].innerText.replace(/\s+/g, ' ').trim();
        let leafName = `${lftText} ${ritText}`.trim();
        if (leafName.startsWith('enum')) {
          leafName = leafName.replace(/\s*\{[\s\S]*\}/, '').trim();
        }
        if (seenName.has(leafName)) {
          return;
        }

        seenHref.add(leafHref);
        seenName.add(leafName);

        grpSigs.push([leafName, leafHref, null]);
      });

      if (grpSigs.length > 0) {
        _secTree.push([headName, headHref, grpSigs]);
      }
    });

    if (_secTree.length > 0) {
      _secTreeRemarks = 'Successfully generated member signatures';
      //console.log('Gen Sec Tree: Successfully generated member signatures');
    }
    else {
      _secTreeRemarks = 'No member signature found';
      //console.log('Gen Sec Tree: No member signature found');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 GEN SEC TREE

  // #region 🟩 DUAL NAV FUNCTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function setDualPriNavWidth(w) {
    if (w !== _wPri) {
      _wPri = w;
      saveValLocalStorage(KEY_PRI_WIDTH, w);
    }
  }

  function setDualSecNavWidth(w) {
    if (w !== _wSec) {
      _wSec = w;
      saveValLocalStorage(KEY_SEC_WIDTH, w);
    }
  }

  async function dualNavLayout() {
    const doc = await waitFor('#doc-content');
    const docMargin = window.getComputedStyle(doc).marginLeft;
    const wWin = window.innerWidth;
    if (wWin < 768) {
      if (docMargin !== '0px') {
        doc.style.setProperty('margin-left', '0px', 'important');
        //console.log('Dual Nav Layout: Window size is less than 768 pixels and doc margin was not 0 pixels, it is set to 0 pixels now');
      }
    }
    else {
      const priP = waitFor('#npi-pri-nav');
      const priResP = waitFor('#npi-pri-nav-resizer');
      const secP = waitFor('#npi-sec-nav');
      const secResP = waitFor('#npi-sec-nav-resizer');
      const [pri, priRes, sec, secRes] = await Promise.all([priP, priResP, secP, secResP]);

      const maxTotal = wWin - GUTTER_W;
      if (_secTree.length > 0) {
        const total = _wPri + _wSec;
        if (total > maxTotal) {
          // compute proportional sizes
          const ratio = _wPri / total;
          let newPri = Math.floor(maxTotal * ratio);
          let newSec = maxTotal - newPri;

          // enforce minimum on either one
          if (newPri < MIN_W) {
            newPri = MIN_W;
            newSec = maxTotal - newPri;
          }
          if (newSec < MIN_W) {
            newSec = MIN_W;
            newPri = maxTotal - newSec;
          }

          setDualPriNavWidth(newPri);
          setDualSecNavWidth(newSec);
        }

        $(pri).css({ width: _wPri + 'px' });
        $(priRes).css({ left: (_wPri - 2) + 'px' });
        $(sec).css({ left: _wPri + 'px', width: _wSec + 'px' });
        $(secRes).css({ left: (_wPri + _wSec - 2) + 'px' });

        const newDocMargin = _wPri + _wSec + 'px';
        if (_dualNav && docMargin !== newDocMargin) {
          doc.style.setProperty('margin-left', newDocMargin, 'important');
        }
      }
      else {
        if (_wPri > maxTotal) {
          setDualPriNavWidth(maxTotal);
        }

        $(pri).css({ width: _wPri + 'px' });
        $(priRes).css({ left: (_wPri - 2) + 'px' });

        const newDocMargin = _wPri + 'px';
        if (_dualNav && docMargin !== newDocMargin) {
          doc.style.setProperty('margin-left', newDocMargin, 'important');
        }
      }

      //console.log('Dual Nav Layout: SUCCESS');
    }
  }

  function dualNavResizer(resizerId, getW) {

    // no args? wire both and return
    if (!resizerId) {
      dualNavResizer('npi-pri-nav-resizer', () => _wPri);
      dualNavResizer('npi-sec-nav-resizer', () => _wSec);
      return;
    }

    const maxTotal = () => window.innerWidth - GUTTER_W;
    const resizer = document.getElementById(resizerId);
    let startX = 0, startW = 0, raf = null;

    function onMove(ev) {
      ev.preventDefault();
      if (raf) return;
      raf = requestAnimationFrame(() => {
        let newW = startW + (ev.clientX - startX);
        if (resizerId === 'npi-sec-nav-resizer') {
          if (newW < MIN_W) {
            const over = MIN_W - newW;
            const secNew = MIN_W;
            const priNew = Math.max(MIN_W, _wPri - over);
            if (secNew != _wSec || priNew != _wPri) {
              setDualPriNavWidth(priNew);
              setDualSecNavWidth(secNew);
              dualNavLayout();
              startX = ev.clientX;
              startW = secNew;
            }
          }
          else {
            if (newW > (maxTotal() - _wPri))
              newW = maxTotal() - _wPri;
            if (newW != _wSec) {
              setDualSecNavWidth(newW);
              dualNavLayout();
            }
          }
        }
        else {
          if (_secTree.length > 0) {
            newW = Math.max(MIN_W, Math.min(maxTotal() - MIN_W, newW));
            if (newW != _wPri) {
              if (newW < _wPri)
                setDualSecNavWidth(_wSec + (_wPri - newW));
              else {
                if (newW + _wSec > maxTotal()) {
                  setDualSecNavWidth(maxTotal() - newW);
                }
                else if (_wSec > MIN_W) {
                  const secNew = Math.max(MIN_W, _wSec - (newW - _wPri));
                  if (secNew != _wSec)
                    setDualSecNavWidth(secNew);
                }
              }
              setDualPriNavWidth(newW);
              dualNavLayout();
            }
          }
          else {
            newW = Math.max(MIN_W, Math.min(maxTotal(), newW));
            if (newW != _wPri) {
              setDualPriNavWidth(newW);
              dualNavLayout();
            }
          }
        }
        raf = null;
      });
    }

    function onUp(evtUp) {
      evtUp.preventDefault();
      document.body.style.cursor = '';
      //resizer.releasePointerCapture(evtUp.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    }

    resizer.addEventListener('pointerdown', evtDown => {
      evtDown.preventDefault();
      //resizer.setPointerCapture(evtDown.pointerId);
      startX = evtDown.clientX;
      startW = getW();
      document.body.style.cursor = 'ew-resize';
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp, { passive: false });
      document.addEventListener('pointercancel', onUp, { passive: false });
    }, { passive: false });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 DUAL NAV FUNCTIONS

  // #region 🟩 STABILIZE DOC MARGIN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function stabilizeDocMargin() {
    const doc = await waitFor('#doc-content');
    let newMargin = '0px';
    if (window.innerWidth >= 768) {
      if (_dualNav) {
        if (_secTree.length > 0) {
          newMargin = _wPri + _wSec + 'px';
        }
        else {
          newMargin = _wPri + 'px';
        }
      }
      else {
        const nav = await waitFor('#side-nav');
        newMargin = window.getComputedStyle(nav).width;
      }
    }

    const docMargin = window.getComputedStyle(doc).marginLeft;
    if (docMargin !== newMargin) {
      doc.style.setProperty('margin-left', newMargin, 'important');
      _docMarginStableFrames = 0;
      requestAnimationFrame(stabilizeDocMargin);
      //console.log(`Stabilize Doc Margin: Current = ${docMargin}, New = ${newMargin}`);
    }
    else {
      _docMarginStableFrames++;
      //console.log(`Stabilize Doc Margin: Stable ${newMargin} [Frames = ${_docMarginStableFrames}]`);
      if (_docMarginStableFrames < 5) {
        requestAnimationFrame(stabilizeDocMargin);
      }
      else {
        _docMarginStableFrames = 0;
      }
    }

  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 STABILIZE DOC MARGIN

  // #region 🟩 SET CORRECT LAYOUT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // listener callback is called whenever crossing the threshold or it can be called manually using 
  // 'setCorrectLayout(MEDIA_QUERY_WIN_WIDTH);'
  function setCorrectLayout(e) {
    if (e.matches) { // viewport is now ≥768px
      setCorrectLayoutWide();
    } else { // viewport is now <768px
      setCorrectLayoutNarrow();
    }
    stabilizeDocMargin(); // stabilize the doc margin because sometimes it is not correct
  }

  // add listener (modern browsers)
  MEDIA_QUERY_WIN_WIDTH.addEventListener('change', setCorrectLayout);

  // if you need to support really old browsers:
  // MEDIA_QUERY_WIN_WIDTH.addListener(setCorrectLayout);

  async function setCorrectLayoutNarrow() {

    window.removeEventListener('resize', dualNavLayout);

    const sideNavP = waitFor('#side-nav');
    const priP = waitFor('#npi-pri-nav');
    const priResP = waitFor('#npi-pri-nav-resizer');
    const secP = waitFor('#npi-sec-nav');
    const secResP = waitFor('#npi-sec-nav-resizer');
    const [sideNav, pri, priRes, sec, secRes] = await Promise.all([sideNavP, priP, priResP, secP, secResP]);

    $(sideNav).hide();
    $(pri).hide();
    $(priRes).hide();
    $(sec).hide();
    $(secRes).hide();

    //console.log('Set Correct Layout - Narrow: SUCCESS');
  }

  async function setCorrectLayoutWide() {

    window.removeEventListener('resize', dualNavLayout);

    const sideNavP = waitFor('#side-nav');
    const priP = waitFor('#npi-pri-nav');
    const priResP = waitFor('#npi-pri-nav-resizer');
    const secP = waitFor('#npi-sec-nav');
    const secResP = waitFor('#npi-sec-nav-resizer');
    const [sideNav, pri, priRes, sec, secRes] = await Promise.all([sideNavP, priP, priResP, secP, secResP]);

    if (_dualNav) {

      $(sideNav).hide();

      $(pri).show();
      $(priRes).show();
      if (_secTree.length > 0) {
        $(sec).show();
        $(secRes).show();
      }
      else {
        $(sec).hide();
        $(secRes).hide();
      }

      window.addEventListener('resize', dualNavLayout);
      dualNavLayout();

      //console.log('Set Correct Layout - Wide: SUCCESS - Dual Nav');
    }
    else {
      $(pri).hide();
      $(priRes).hide();
      $(sec).hide();
      $(secRes).hide();
      $(sideNav).show();

      //console.log('Set Correct Layout - Wide: SUCCESS - Side Nav');
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 SET CORRECT LAYOUT

  // #region 🟩 ADJUST HEIGHTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function adjustXandH() {
    const topP = waitFor('#top');
    const navP = waitFor('#side-nav');
    const docP = waitFor('#doc-content');
    const btmP = waitFor('#nav-path');
    const priP = waitFor('#npi-pri-nav');
    const priResP = waitFor('#npi-pri-nav-resizer');
    const secP = waitFor('#npi-sec-nav');
    const secResP = waitFor('#npi-sec-nav-resizer');
    const [top, nav, doc, btm, pri, priRes, sec, secRes] = await Promise.all([topP, navP, docP, btmP, priP, priResP, secP, secResP]);

    const hWin = window.innerHeight;
    const hBtm = btm.getBoundingClientRect().height;
    const xVal = top.getBoundingClientRect().height;
    const hVal = hWin - xVal - hBtm;
    const xTxt = xVal + 'px';
    const hTxt = hVal + 'px';

    pri.style.setProperty('top', xTxt, 'important');
    priRes.style.setProperty('top', xTxt, 'important');
    sec.style.setProperty('top', xTxt, 'important');
    secRes.style.setProperty('top', xTxt, 'important');

    nav.style.setProperty('height', hTxt, 'important');
    doc.style.setProperty('height', hTxt, 'important');
    pri.style.setProperty('height', hTxt, 'important');
    priRes.style.setProperty('height', hTxt, 'important');
    sec.style.setProperty('height', hTxt, 'important');
    secRes.style.setProperty('height', hTxt, 'important');

    //console.log(`Adjust X & H: X=${xTxt} & H=${hTxt}`);
  }

  async function adjustXandH_init() {

    // disconnect resize observer if it is not null
    if (_adjustXandH_resizeObserver) {
      _adjustXandH_resizeObserver.disconnect();
      _adjustXandH_resizeObserver = null;
    }

    // In IE11 or very old Safari (i.e. very old browsers) it might not have
    // ResizeObserver, in that case we fallback to resize with a timeout
    if ('ResizeObserver' in window) {
      const top = await waitFor('#top');
      _adjustXandH_resizeObserver = new ResizeObserver(entries => {
        adjustXandH(); // only one entry here is `top`, so no need to go thorugh all entries and checking of ids
      });
      _adjustXandH_resizeObserver.observe(top);
      //console.log('Adjust X & H - INIT: Resize Observer Connected');
    }
    else {
      window.addEventListener('resize', () => setTimeout(adjustXandH, 10));
      //console.log('Adjust X & H - INIT: Resize Observer not available in this browser, resize with timeout connected');
    }

    // Fire on window load once
    window.addEventListener('load', adjustXandH);

    //console.log('Adjust X & H - INIT: SUCCESS');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 ADJUST HEIGHTS

  // #region 🟩 DOCUMENT DOM LOADING CALLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function docOnReady() {
    searchPlaceholderTweak();
    sideNavTweak();
    navToggleButton();
    dualNavResizer();
    await genSecTree();
    setCorrectLayout(MEDIA_QUERY_WIN_WIDTH);
    adjustXandH_init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', docOnReady);
  } else {
    docOnReady();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 DOCUMENT LOADING CALLS

})(jQuery);