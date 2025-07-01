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
  const HTML_NAME = window.location.href.split('/').pop().replace(/\..*$/, '');

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
  let _priExpandedNodes = new Set();

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

  // #region 🟩 CONSOLE OBJECT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const conObj = Object.create(null); // main object

  Object.defineProperty(conObj, 'root', { // npi.root -> DOC_ROOT
    get() {
      console.log(`Root: ${DOC_ROOT}`);
    },
    configurable: true
  });

  Object.defineProperty(conObj, 'pri_tree', { // npi.pri_tree -> _priTree
    get() {
      console.log('● ● ● ● ● PRI TREE ● ● ● ● ●');
      if (_priTree.length > 0) {
        printTree(_priTree);
      }
      else {
        console.log('Pri Tree is EMPTY');
      }
      console.log('○ ○ ○ ○ ○ PRI TREE ○ ○ ○ ○ ○');
    },
    configurable: true
  });

  Object.defineProperty(conObj, 'pri_tree_discarded', { // npi.pri_tree_discarded -> _priTreeDiscarded
    get() {
      console.log('● ● ● ● ● PRI TREE DISCARDED ● ● ● ● ●');
      if (_priTreeDiscarded.length > 0) {
        printTree(_priTreeDiscarded);
      }
      else {
        console.log('Pri Tree Discarded is EMPTY');
      }
      console.log('○ ○ ○ ○ ○ PRI TREE DISCARDED ○ ○ ○ ○ ○');
    },
    configurable: true
  });

  Object.defineProperty(conObj, 'sec_tree', { // npi.sec_tree -> _secTree
    get() {
      console.log('● ● ● ● ● SEC TREE ● ● ● ● ●');
      if (_secTree.length > 0) {
        printTree(_secTree);
      }
      else {
        console.log(`Sec Tree is EMPTY → ${_secTreeRemarks}`);
      }
      console.log('○ ○ ○ ○ ○ SEC TREE ○ ○ ○ ○ ○');
    },
    configurable: true
  });

  Object.defineProperty(conObj, 'sec_tree_remarks', { // npi.sec_tree_remarks -> _secTreeRemarks
    get() {
      console.log(`Sec Tree Remarks: ${_secTreeRemarks}`);
    },
    configurable: true
  });

  Object.defineProperty(conObj, 'help', { // npi.help
    get() {
      console.log(
        '● npi.help → This information ouput\n' +
        '● npi.root → Displays the current root folder\n' +
        '● npi.pri_tree → Displays the primary tree i.e. custom NAVTREE data used for dual nav configuration\n' +
        '● npi.pri_tree_discarded → Displays the primary tree discarded part i.e. default NAVTREE data not included in custom NAVTREE used for dual nav configuration\n' +
        '● npi.sec_tree → Displays the secondary tree i.e. member signatures of the current page if it is a class or struct page\n' +
        '● npi.sec_tree_remarks → Displays the remarks for the secondary tree i.e. member signature generation'
      );
    },
    configurable: true
  });

  window.npi = conObj; // assign 'npi' as the object for windows so that it can be used in console.

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 CONSOLE OBJECT

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

  // #region 🟩 SIDEBAR TOGGLE BUTTON
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function sidebarToggleButton() {
    const itemSearchBox = await waitFor('#searchBoxPos2');
    function setup() {
      mo.disconnect();
      const winWidth = window.innerWidth || document.documentElement.clientWidth;
      if (winWidth >= 768) {
        let btn = itemSearchBox.querySelector('.npi-sidebar-toggle-btn');
        if (btn) {
          itemSearchBox.appendChild(btn);
          const icon = btn.querySelector("img");
          icon.src = DOC_ROOT + (_dualNav ? ICON_DUAL_NAV : ICON_SIDE_NAV);
          //console.log('Sidebar Toggle Button - Setup: Reposition');
        }
        else {
          btn = document.createElement('a');
          btn.className = 'npi-sidebar-toggle-btn';
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
            //console.log(`Sidebar Toggle Button - Click: DualNav = ${_dualNav}`);
          });

          itemSearchBox.appendChild(btn);
          //console.log('Sidebar Toggle Button - Setup: New Button');
        }
      }
      else {
        //console.log('Sidebar Toggle Button - Setup: Width < 768');
      }
      mo.observe(itemSearchBox, { childList: true });
    }
    const mo = new MutationObserver(setup);
    //mo.observe(itemSearchBox, { childList: true });
    setup();
    //console.log('Sidebar Toggle Button: SUCCESS');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 SIDEBAR TOGGLE BUTTON

  // #region 🟩 GEN PRI TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function genPriTree(n = 0) {

    // checking if NAVTREE exists

    if (!window.NAVTREE) {
      console.log(`Gen Pri Tree [${n}]: RERUN → NAVTREE not defined`);
      return rerun(genPriTree, n);
    }

    if (!Array.isArray(window.NAVTREE)) {
      console.log(`Gen Pri Tree [${n}]: RERUN → NAVTREE not an array`);
      return rerun(genPriTree, n);
    }

    if (window.NAVTREE.length == 0) {
      console.log(`Gen Pri Tree [${n}]: RERUN → NAVTREE array is empty`);
      return rerun(genPriTree, n);
    }

    if (!Array.isArray(window.NAVTREE[0])) {
      console.log(`Gen Pri Tree [${n}]: RERUN → NAVTREE array's 1st entry not an array`);
      return rerun(genPriTree, n);
    }

    if (window.NAVTREE[0].length < 3) {
      console.log(`Gen Pri Tree [${n}]: RERUN → NAVTREE array's 1st entry has length less than 3`);
      return rerun(genPriTree, n);
    }

    if (!Array.isArray(window.NAVTREE[0][2])) {
      console.log(`Gen Pri Tree [${n}]: RERUN → NAVTREE array's 1st entry does not have its 3rd entry as an array`);
      return rerun(genPriTree, n);
    }

    // setting the two array's lengths as 0 so that it is reinitialized
    // while maintaining previous links
    _priTree.length = 0;
    _priTreeDiscarded.length = 0;

    // read the previous stored doxygen time (returns null if nothing was stored)
    const prvDoxyTime = sessionStorage.getItem(KEY_GEN_DATA);

    // read the current doxygen time obtained from footer
    let curDoxyTime = null;
    try {
      const footerEl = await waitFor('#nav-path li.footer');
      const text = footerEl.textContent || footerEl.innerText;
      const match = text.match(/Generated\s+on\s+(.+)/i);
      if (match) {
        curDoxyTime = match[1].trim();
      } else {
        console.warn(`Gen Pri Tree [${n}]: Could not find “Generated on …” in "#nav-path li.footer" element`);
      }
    } catch (err) {
      console.error(`Gen Pri Tree [${n}]: Error waiting for footer "#nav-path li.footer" element:`, err);
    }

    // read the stored arrays if current time is same as previous time
    if (prvDoxyTime !== null && prvDoxyTime === curDoxyTime) {
      const priTreeRaw = sessionStorage.getItem(KEY_PRI_TREE);
      if (priTreeRaw !== null) {
        try {
          _priTree = JSON.parse(priTreeRaw);
        }
        catch (e) {
          console.error(`Gen Pri Tree [${n}]: Could not parse stored JSON for _priTree:`, e);
        }

        if (_priTree.length > 0) {

          const priDiscRaw = sessionStorage.getItem(KEY_PRI_TREE_DISCARDED);
          if (priDiscRaw !== null) {
            try {
              _priTreeDiscarded = JSON.parse(priDiscRaw);
            }
            catch (e) {
              console.error(`Gen Pri Tree [${n}]: Could not parse stored JSON for _priTreeDiscarded:`, e);
            }
          }

          console.log(`Gen Pri Tree [${n}]: Loaded from Session Storage`);
          return;
        }
      }
    }

    function cloneTree(tree) {
      return tree.map(([name, href, kids]) => {
        const clonedKids = Array.isArray(kids) ? cloneTree(kids) : kids;
        return [name, href, clonedKids];
      });
    }

    function loadScript(relUrl) {
      return new Promise((res, rej) => {
        const fullUrl = new URL(relUrl, DOC_ROOT).href; // build an absolute URL from a relative path and a base root.
        const s = document.createElement('script'); s.src = fullUrl; s.async = true; // create and configure a <script> tag.
        s.onload = () => res(); // when the script finishes loading, call resolve()
        s.onerror = err => rej(err); // if the script fails to load, call reject(err)
        document.head.appendChild(s); // insert the <script> tag into the page and kicks off the download.
      });
    }

    function loadChildren(tree) {
      const promises = [];
      tree.forEach(node => {
        const c = node[2];
        if (typeof c === 'string') {
          promises.push(
            loadScript(c + '.js')
              .then(() => {
                let arr = window[c];
                if (!Array.isArray(arr)) arr = window[c.split('/').pop()];
                node[2] = Array.isArray(arr) ? arr : [];
                return loadChildren(node[2]);
              })
              .catch(() => { node[2] = []; })
          );
        } else if (Array.isArray(c)) {
          promises.push(loadChildren(c));
        }
      });
      return Promise.all(promises);
    }

    function flatten(oldTree, preName = "", newTree = []) {
      for (let ii = 0; ii < oldTree.length; ++ii) {
        const newName = preName == "" ? oldTree[ii][0] : preName + "::" + oldTree[ii][0];
        newTree.push([newName, oldTree[ii][1], null]);
        if (Array.isArray(oldTree[ii][2]) && oldTree[ii][2].length > 0)
          flatten(oldTree[ii][2], newName, newTree);
      }
      return newTree;
    }

    function flattenFiles(oldTree, preName = "", newTree = []) {
      for (let ii = 0; ii < oldTree.length; ++ii) {
        const newName = preName == "" ? oldTree[ii][0] : preName + "/" + oldTree[ii][0];
        newTree.push([newName, oldTree[ii][1], null]);
        if (Array.isArray(oldTree[ii][2]) && oldTree[ii][2].length > 0)
          flattenFiles(oldTree[ii][2], newName, newTree);
      }
      return newTree;
    }

    function pruneAnchors(tree) {
      for (let ii = tree.length - 1; ii >= 0; --ii) {
        const [name, href, kids] = tree[ii];

        if (typeof href !== 'string' || href.toLowerCase().includes('html#')) {
          tree.splice(ii, 1);
          continue;
        }

        if (Array.isArray(kids) && kids.length > 0) {
          pruneAnchors(kids);
        }
      }
    }

    function pruneAnchorsWithoutChildren(tree) {
      for (let ii = tree.length - 1; ii >= 0; --ii) {
        const [name, href, kids] = tree[ii];

        if (Array.isArray(kids) && kids.length > 0) {
          pruneAnchorsWithoutChildren(kids);
        }

        if ((!Array.isArray(kids) || kids.length === 0) && (typeof href !== 'string' || href.toLowerCase().includes('html#'))) {
          tree.splice(ii, 1);
        }
      }
    }

    function pruneNonNamespace(tree) {
      for (let ii = tree.length - 1; ii >= 0; --ii) {
        const [name, href, kids] = tree[ii];

        if (typeof href !== 'string' || href.toLowerCase().includes('html#')) {
          tree.splice(ii, 1);
          continue;
        }

        const htmlName = href.split('/').pop() || '';
        if (!htmlName.toLowerCase().startsWith('namespace')) {
          tree.splice(ii, 1);
          continue;
        }

        if (Array.isArray(kids) && kids.length > 0) {
          pruneNonNamespace(kids);
        }
      }
    }

    function pruneNonFile(tree) {
      for (let ii = tree.length - 1; ii >= 0; --ii) {
        const [name, href, kids] = tree[ii];

        if (typeof href !== 'string' || href.toLowerCase().includes('html#')) {
          tree.splice(ii, 1);
          continue;
        }

        const htmlName = href.split('/').pop() || '';
        if (!htmlName.startsWith('_') && !htmlName.startsWith('dir_')) {
          tree.splice(ii, 1);
          continue;
        }

        if (Array.isArray(kids) && kids.length > 0) {
          pruneNonFile(kids);
        }
      }
    }

    // copy the default base nav tree data
    _priTreeDiscarded = cloneTree(window.NAVTREE[0][2]);

    // load all children and wait for it to complete
    await loadChildren(_priTreeDiscarded);

    // Namespaces Entries
    if (_priTreeDiscarded.length > 0) {
      for (let ii = 0; ii < _priTreeDiscarded.length; ++ii) {
        const [name, href, kids] = _priTreeDiscarded[ii];
        if (name === 'Namespaces' && Array.isArray(kids) && kids.length > 0) {

          for (let jj = 0; jj < kids.length; ++jj) {
            if (kids[jj][0] === 'Namespace List') {
              if (Array.isArray(kids[jj][2]) && kids[jj][2].length > 0) {
                pruneNonNamespace(kids[jj][2]);
                if (kids[jj][2].length > 0) {
                  _priTree.push(['Namespaces', kids[jj][1], flatten(kids[jj][2])]);
                }
              }
              kids.splice(jj, 1);
              break;
            }
          }

          if (kids.length > 0) {
            for (let jj = 0; jj < kids.length; ++jj) {
              if (kids[jj][0] === 'Namespace Members') {
                if (Array.isArray(kids[jj][2]) && kids[jj][2].length > 0) {
                  let temp = flatten(kids[jj][2]);
                  if (temp.length > 0) {
                    let idx = -1;
                    for (let kk = 0; kk < temp.length; ++kk) {
                      if (temp[kk][0] === 'All') {
                        idx = kk;
                        break;
                      }
                    }
                    if (idx > -1) {
                      let tempHref = temp[idx][1];
                      temp.splice(idx, 1);
                      if (temp.length > 0) {
                        _priTree.push(['Globals', tempHref, temp]);
                      }
                      else if (typeof tempHref === 'string' && tempHref.trim().length > 0) {
                        _priTree.push(['Globals', tempHref, null]);
                      }
                    }
                  }
                }
                kids.splice(jj, 1);
                break;
              }
            }
          }

          if (kids.length == 0) {
            _priTreeDiscarded.splice(ii, 1);
          }

          break;
        }
      }
    }

    // Concepts
    if (_priTreeDiscarded.length > 0) {
      for (let ii = 0; ii < _priTreeDiscarded.length; ++ii) {
        const [name, href, kids] = _priTreeDiscarded[ii];
        if (name === 'Concepts') {
          if (Array.isArray(kids) && kids.length > 0) {
            let flat = flatten(kids);
            for (let jj = flat.length - 1; jj >= 0; --jj) {

              if (typeof flat[jj][1] !== 'string' || flat[jj][1].toLowerCase().includes('html#')) {
                flat.splice(ii, 1);
                continue;
              }

              const htmlName = flat[jj][1].split('/').pop() || '';
              if (!htmlName.toLowerCase().startsWith('concept')) {
                flat.splice(ii, 1);
                continue;
              }
            }
            if (flat.length > 0) {
              _priTree.push(['Concepts', href, flat]);
            }
          }
          _priTreeDiscarded.splice(ii, 1);
          break;
        }
      }
    }

    // Classes Entries
    if (_priTreeDiscarded.length > 0) {
      for (let ii = 0; ii < _priTreeDiscarded.length; ++ii) {
        const [name, href, kids] = _priTreeDiscarded[ii];
        if (name === 'Classes' && Array.isArray(kids) && kids.length > 0) {

          let classesInserted = false;
          for (let jj = 0; jj < kids.length; ++jj) {
            if (kids[jj][0] === 'Class List') {
              if (Array.isArray(kids[jj][2]) && kids[jj][2].length > 0) {
                pruneAnchors(kids[jj][2]);
                if (kids[jj][2].length > 0) {
                  let flat = flatten(kids[jj][2]);
                  for (let kk = flat.length - 1; kk >= 0; --kk) {

                    if (typeof flat[kk][1] !== 'string' || flat[kk][1].toLowerCase().includes('html#')) {
                      flat.splice(ii, 1);
                      continue;
                    }

                    const htmlName = flat[kk][1].split('/').pop() || '';
                    if (!htmlName.startsWith('class') && !htmlName.startsWith('struct')) {
                      flat.splice(kk, 1);
                      continue;
                    }
                  }
                  if (flat.length > 0) {
                    classesInserted = true;
                    _priTree.push(['Classes', kids[jj][1], flat]);
                  }
                }
              }
              kids.splice(jj, 1);
              break;
            }
          }

          if (kids.length > 0 && classesInserted) {
            for (let jj = 0; jj < kids.length; ++jj) {
              if (kids[jj][0] === 'Class Index') {
                if (!Array.isArray(kids[jj][2]) || kids[jj][2].length == 0) {
                  _priTree[_priTree.length - 1][2].push(['Index', kids[jj][1], null]);
                }
                kids.splice(jj, 1);
                break;
              }
            }
          }

          if (kids.length > 0) {
            for (let jj = 0; jj < kids.length; ++jj) {
              if (kids[jj][0] === 'Class Members') {
                if (Array.isArray(kids[jj][2]) && kids[jj][2].length > 0) {
                  let temp = flatten(kids[jj][2]);
                  if (temp.length > 0) {
                    let idx = -1;
                    for (let kk = 0; kk < temp.length; ++kk) {
                      if (temp[kk][0] === 'All') {
                        idx = kk;
                        break;
                      }
                    }
                    if (idx > -1) {
                      let tempHref = temp[idx][1];
                      temp.splice(idx, 1);
                      if (temp.length > 0) {
                        _priTree.push(['Class Members', tempHref, temp]);
                      }
                      else if (typeof tempHref === 'string' && tempHref.trim().length > 0) {
                        _priTree.push(['Class Members', tempHref, null]);
                      }
                    }
                  }
                }
                kids.splice(jj, 1);
                break;
              }
            }
          }

          if (kids.length == 0) {
            _priTreeDiscarded.splice(ii, 1);
          }

          break;
        }
      }
    }

    // Files
    if (_priTreeDiscarded.length > 0) {
      for (let ii = 0; ii < _priTreeDiscarded.length; ++ii) {
        const [name, href, kids] = _priTreeDiscarded[ii];
        if (name === 'Files') {

          if (Array.isArray(kids) && kids.length > 0) {
            for (let jj = 0; jj < kids.length; ++jj) {
              if (kids[jj][0] === 'File List') {
                if (Array.isArray(kids[jj][2]) && kids[jj][2].length > 0) {
                  pruneNonFile(kids[jj][2]);
                  if (kids[jj][2].length > 0) {
                    _priTree.push(['Files', kids[jj][1], flattenFiles(kids[jj][2])]);
                  }
                }
                kids.splice(jj, 1);
                break;
              }
            }
          }

          if (kids.length == 0) {
            _priTreeDiscarded.splice(ii, 1);
          }

          break;
        }
      }
    }

    _priTree.push(['Ind A', null, null]);
    _priTree.push(['Ind B', null, null]);

    _priTree.push([
      'Level 0',
      null,
      [
        [  // ← child-array starts here
          'Level 1',
          null,
          [
            ['Level A', null, null],
            ['Level B', null, null],
            ['Level C', null, null],
            [
              'Level 2',
              null,
              [
                ['Level x', null, null],
                [
                  'Level 3',
                  null,
                  [
                    [
                      'Level 4',
                      null,
                      [
                        ['Level 5', null, null]
                      ]
                    ]
                  ]
                ]
              ]
            ]
          ]
        ]  // ← end of children of Level 0
      ]
    ]);

    _priTree.push(['Ind C', null, null]);

    sessionStorage.setItem(KEY_GEN_DATA, curDoxyTime);
    sessionStorage.setItem(KEY_PRI_TREE, JSON.stringify(_priTree));
    sessionStorage.setItem(KEY_PRI_TREE_DISCARDED, JSON.stringify(_priTreeDiscarded));

    console.log(`Gen Pri Tree [${n}]: Generated`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 GEN PRI TREE

  // #region 🟩 GEN SEC TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function formatMemSigs(text) {
    if (typeof text !== 'string') return text;

    return text
      // Remove space before *, &, &&
      .replace(/\s+([*&]{1,2})/g, '$1')
      // Ensure space after *, &, &&
      .replace(/([*&]{1,2})(?!\s)/g, '$1 ')

      // Remove spaces inside <...>
      .replace(/<\s+/g, '<')
      .replace(/\s+>/g, '>')
      .replace(/\s+<\s+/g, '<')
      .replace(/\s+>\s+/g, '>')

      // Remove space before commas, ensure one after
      .replace(/\s+,/g, ',')
      .replace(/,(?!\s)/g, ', ')

      // Remove space after ( and before )
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')

      // ❗ Remove space before (
      .replace(/\s+\(/g, '(')

      // Add space before and after = in special cases
      .replace(/\s*=\s*(default|delete|0)/g, ' = $1')

      // Collapse multiple spaces and trim
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

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
        let leafNameTemp = `${lftText} ${ritText}`.trim();
        let leafName = formatMemSigs(leafNameTemp);
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

  // #region 🟩 BUILD TREE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function buildPriTree() {
    if (_priTree.length === 0) {
      console.warn('Build Pri Tree: _priTree array is EMPTY');
      return;
    }

    // 1) Load stored IDs
    const expdRaw = sessionStorage.getItem(KEY_PRI_NAV_EXPANDED_NODES);
    if (expdRaw !== null) {
      try {
        const expdAry = JSON.parse(expdRaw);
        _priExpandedNodes = new Set(expdAry);
      }
      catch (e) {
        console.error(`Gen Pri Tree: Could not parse JSON for _priExpandedNodes:`, e);
        _priExpandedNodes = new Set();
      }
    }
    else {
      _priExpandedNodes = new Set();
    }

    // 2) Track which IDs actually exist in this build
    const curExpandableNodes = new Set();

    function builder(tree, level = []) {
      const list = document.createElement('ul');
      list.classList.add('npi-tree-list');

      tree.forEach(([name, path, kids], idx) => {
        const href = (typeof path === 'string' && path) ? DOC_ROOT + path : null;
        const item = document.createElement('li');
        item.classList.add('npi-tree-item');
        const line = document.createElement('div');
        line.classList.add('npi-tree-line');
        const node = document.createElement('button');
        node.classList.add('npi-tree-node');
        const link = document.createElement('a');
        link.classList.add('npi-tree-link');

        line.append(node, link);
        item.appendChild(line);

        if (href) {
          link.href = href;
        } else {
          link.removeAttribute('href');
          link.setAttribute('aria-disabled', 'true');
          link.style.cursor = 'default';
          link.setAttribute('tabindex', '-1');
        }
        link.textContent = name;

        if (Array.isArray(kids) && kids.length > 0) {
          // build a stable ID: either the file base name, or the path of indices
          const thisLevel = [...level, idx];
          const fileBase = href
            ? path.split('/').pop().replace(/\..*$/, '')
            : null;
          const id = fileBase || thisLevel.join('.');

          curExpandableNodes.add(id);

          item.classList.add('npi-has-children');
          if (_priExpandedNodes.has(id)) {
            item.classList.add('npi-node-open');
            node.textContent = '○';
          } else {
            node.textContent = '●';
          }

          node.addEventListener('click', e => {
            e.stopPropagation();
            const nowOpen = item.classList.toggle('npi-node-open');
            node.textContent = nowOpen ? '○' : '●';

            if (nowOpen) _priExpandedNodes.add(id);
            else _priExpandedNodes.delete(id);

            sessionStorage.setItem(
              KEY_PRI_NAV_EXPANDED_NODES,
              JSON.stringify([..._priExpandedNodes])
            );
          });

          item.appendChild(builder(kids, thisLevel));
        } else {
          node.style.visibility = 'hidden';
        }

        list.appendChild(item);
      });

      return list;
    }

    // 3) Prune any IDs no longer present
    for (const id of [..._priExpandedNodes]) {
      if (!curExpandableNodes.has(id)) {
        _priExpandedNodes.delete(id);
      }
    }
    // 4) Persist the cleaned set
    sessionStorage.setItem(
      KEY_PRI_NAV_EXPANDED_NODES,
      JSON.stringify([..._priExpandedNodes])
    );

    // 5) Render
    const pri = await waitFor('#npi-pri-nav');
    pri.innerHTML = '';                      // clear old tree
    pri.appendChild(builder(_priTree));
  }


  function buildTree(tree, curHref, addRoot = false, showVisited = false, expanded = '') {

    let expdSet = new Set();
    const expdAll = (expanded === 'all');
    if (!expdAll && expanded) {
      try {
        const expdAry = JSON.parse(sessionStorage.getItem(expanded)) || [];
        expdSet = new Set(expdAry);
      }
      catch (err) {
        console.error(`Build Tree: Session Key "${expanded}" Error:`, err);
      }
    }

    function builder(subTree, path = []) {
      if (!Array.isArray(subTree) || subTree.length == 0) {
        console.warn('Build Tree - Builder: Passed Sub Tree is not an Array or is Empty');
        return;
      }

      const list = document.createElement('ul');
      list.classList.add('npi-tree-list');

      subTree.forEach(([name, tref, kids], idx) => {

        const thisPath = [...path, idx];
        //console.log(thisPath, String(thisPath) + ':' + tref);

        const nodeId = (Array.isArray(kids) && kids.length > 0) ? (typeof tref === 'string' && tref.length > 0) ? tref.split('/').pop().replace(/\..*$/, '') : String(thisPath) : null;
        console.log(nodeId);

        const href = (typeof tref === 'string' && tref.length > 0) ? (addRoot ? DOC_ROOT + tref : tref) : null;

        const item = document.createElement('li');
        item.classList.add('npi-tree-item');

        const line = document.createElement('div');
        line.classList.add('npi-tree-line');

        const node = document.createElement('button');
        node.classList.add('npi-tree-node');

        const link = document.createElement('a');
        link.classList.add('npi-tree-link');

        line.appendChild(node);
        line.appendChild(link);
        item.appendChild(line);

        if (href !== null) {
          link.href = href;
        }
        else {
          link.removeAttribute('href');               // no href → no navigation
          link.setAttribute('aria-disabled', 'true'); // aria-disabled="true" is a WAI-ARIA attribute that tells screen-readers and other assistive technologies that this “link” is in a disabled state.
          link.style.cursor = 'default';              // visual cue
          link.setAttribute('tabindex', '-1');        // remove from keyboard tab order
        }
        link.textContent = name;

        if (showVisited) {
          link.addEventListener('click', e => {
            item.classList.add('npi-visited');
          });
        }

        if (Array.isArray(kids) && kids.length > 0) {

          item.classList.add('npi-has-children');

          const isOpen = expdAll || expdSet.has(href);
          if (isOpen) {
            item.classList.add('npi-node-open');
            node.textContent = '○';
          }
          else {
            node.textContent = '●';
          }

          node.addEventListener('click', e => {
            e.stopPropagation();
            const nowOpen = item.classList.toggle('npi-node-open');
            node.textContent = nowOpen ? '○' : '●';

            if (expanded && !expdAll) {
              if (nowOpen) expdSet.add(href);
              else expdSet.delete(href);
              sessionStorage.setItem(expanded, JSON.stringify([...expdSet]));
            }
          });

          item.appendChild(builder(kids, thisPath));
        }
        else {
          node.style.visibility = 'hidden';
        }

        list.appendChild(item);
      });

      return list;
    }

    //console.log(expdSet);
    return builder(tree);
  }

  function setCurrentTreeItem(tree, curHref) {
    document.querySelectorAll(tree).forEach(link => {
      if (link.href === curHref) {
        link.classList.remove('current');
        const head = link.closest('.npi-tree-line');
        if (head) {
          head.classList.add('current');
        }

        let parentLi = link.closest('li.has-children');
        while (parentLi) {
          parentLi.classList.add('open');
          const pHead = parentLi.querySelector('.npi-tree-line');
          const btn = pHead && pHead.querySelector('.npi-tree-node'); // also update its toggle button to “○”
          if (btn) btn.textContent = '○';
          parentLi = parentLi.parentElement.closest('li.has-children');
        }
      }
      else {
        link.classList.remove('current');
      }
    });
  }

  async function buildTree_init() {
    const [pri, sec] = await Promise.all([waitFor('#npi-pri-nav'), waitFor('#npi-sec-nav')]);
    pri.innerHTML = '';
    sec.innerHTML = '';
    pri.appendChild(buildTree(_priTree, window.location.href.split('#')[0], true, false, KEY_PRI_NAV_EXPANDED_NODES));
    if (_secTree.length > 0) {
      sec.appendChild(buildTree(_secTree, window.location.hash, false, true, 'all'));
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 BUILD TREE

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

  // #region 🟩 ADJUST X AND H
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
  // #endregion 🟥 ADJUST X AND H

  // #region 🟩 URL ANCHOR HASH LISTNER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  window.addEventListener('hashchange', function (event) {
    // This function is called whenever the anchor part (i.e. tge hash part of ...html#...) in the URL changess
    if (_secTree.length > 0) {
      //setCurrentTreeItem('#npi-sec-nav .npi-tree-link', window.location.hash);
    }
    console.log('New Hash', window.location.hash);
    sessionStorage.setItem('Test', window.location.hash);
  }, false);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 URL ANCHOR HASH LISTNER

  // #region 🟩 DOCUMENT DOM LOADING CALLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async function docOnReady() {
    searchPlaceholderTweak();
    sideNavTweak();
    sidebarToggleButton();
    dualNavResizer();
    await genPriTree();
    await genSecTree();
    setCorrectLayout(MEDIA_QUERY_WIN_WIDTH);
    adjustXandH_init();
    /*
    buildTree_init();
    const a = document.createElement('a');
    a.href = window.location.hash;
    console.log('ROOT:', DOC_ROOT);
    console.log('URL:', window.location.href);
    console.log('Name:', HTML_NAME);
    console.log('HASH:', window.location.hash);
    console.log('HREF:', a.href);
    console.log('Test:', sessionStorage.getItem('Test'));
    */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', docOnReady);
  } else {
    docOnReady();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // #endregion 🟥 DOCUMENT LOADING CALLS

})(jQuery);