const { strip, regexEscapeString } = require("../lib/lib");
const Logger = require("../lib/logger");
const shadow_css_tpl = require("./shadow_css_tpl");

var regStrip = /^[\r\t\f\v ]+|[\r\t\f\v ]+$/gm;
var regEndsWithFlags = /\/(?!.*(.).*\1)[gimsuy]*$/;

var tc = {
  settings: {
    lastSpeed: 1.0, // default 1x
    enabled: true, // default enabled
    speeds: {}, // empty object to hold speed for each source

    displayKeyCode: 86, // default: V
    rememberSpeed: false, // default: false
    forceLastSavedSpeed: false, //default: false
    audioBoolean: false, // default: false
    startHidden: false, // default: false
    controllerOpacity: 0.3, // default: 0.3
    keyBindings: [],
    blacklist: `\
      www.instagram.com
      twitter.com
      vine.co
      imgur.com
      teams.microsoft.com
    `,
    defaultLogLevel: 4,
    logLevel: 6,
  },

  // Holds a reference to all of the AUDIO/VIDEO DOM elements we've attached to
  mediaElements: [],
};

let logger = new Logger();
logger.verbosity = tc.settings.logLevel;
logger.defaultLogLevel = tc.settings.defaultLogLevel;

chrome.storage.sync.get(tc.settings, function (storage) {
  tc.settings.keyBindings = storage.keyBindings; // Array
  if (storage.keyBindings.length == 0) {
    // if first initialization of 0.5.3
    // UPDATE
    tc.settings.keyBindings.push({
      action: "slower",
      key: Number(storage.slowerKeyCode) || 83,
      value: Number(storage.speedStep) || 0.1,
      force: false,
      predefined: true,
    }); // default S
    tc.settings.keyBindings.push({
      action: "faster",
      key: Number(storage.fasterKeyCode) || 68,
      value: Number(storage.speedStep) || 0.1,
      force: false,
      predefined: true,
    }); // default: D
    tc.settings.keyBindings.push({
      action: "rewind",
      key: Number(storage.rewindKeyCode) || 90,
      value: Number(storage.rewindTime) || 10,
      force: false,
      predefined: true,
    }); // default: Z
    tc.settings.keyBindings.push({
      action: "advance",
      key: Number(storage.advanceKeyCode) || 88,
      value: Number(storage.advanceTime) || 10,
      force: false,
      predefined: true,
    }); // default: X
    tc.settings.keyBindings.push({
      action: "reset",
      key: Number(storage.resetKeyCode) || 82,
      value: 1.0,
      force: false,
      predefined: true,
    }); // default: R
    tc.settings.keyBindings.push({
      action: "fast",
      key: Number(storage.fastKeyCode) || 71,
      value: Number(storage.fastSpeed) || 1.8,
      force: false,
      predefined: true,
    }); // default: G
    tc.settings.keyBindings.push({
      action: "fullscreen",
      key: Number(storage.fullscreenKeyCode) || 70,
      value: 0,
      force: false,
      predefined: true,
    }); // default: F
    tc.settings.version = "0.5.3";

    chrome.storage.sync.set({
      keyBindings: tc.settings.keyBindings,
      version: tc.settings.version,
      displayKeyCode: tc.settings.displayKeyCode,
      rememberSpeed: tc.settings.rememberSpeed,
      forceLastSavedSpeed: tc.settings.forceLastSavedSpeed,
      audioBoolean: tc.settings.audioBoolean,
      startHidden: tc.settings.startHidden,
      enabled: tc.settings.enabled,
      controllerOpacity: tc.settings.controllerOpacity,
      blacklist: tc.settings.blacklist,
    });
  }
  tc.settings.lastSpeed = Number(storage.lastSpeed);
  tc.settings.displayKeyCode = Number(storage.displayKeyCode);
  tc.settings.rememberSpeed = Boolean(storage.rememberSpeed);
  tc.settings.forceLastSavedSpeed = Boolean(storage.forceLastSavedSpeed);
  tc.settings.audioBoolean = Boolean(storage.audioBoolean);
  tc.settings.enabled = Boolean(storage.enabled);
  tc.settings.startHidden = Boolean(storage.startHidden);
  tc.settings.controllerOpacity = Number(storage.controllerOpacity);
  tc.settings.blacklist = String(storage.blacklist);

  // ensure that there is a "display" binding (for upgrades from versions that had it as a separate binding)
  if (
    tc.settings.keyBindings.filter((x) => x.action == "display").length == 0
  ) {
    tc.settings.keyBindings.push({
      action: "display",
      key: Number(storage.displayKeyCode) || 86,
      value: 0,
      force: false,
      predefined: true,
    }); // default V
  }

  initializeWhenReady(document);
});

function getKeyBindings(action, what = "value") {
  try {
    return tc.settings.keyBindings.find((item) => item.action === action)[what];
  } catch (e) {
    return false;
  }
}

function setKeyBindings(action, value) {
  tc.settings.keyBindings.find((item) => item.action === action)["value"] =
    value;
}

function defineVideoController() {
  // Data structures
  // ---------------
  // videoController (JS object) instances:
  //   video = AUDIO/VIDEO DOM element
  //   parent = A/V DOM element's parentElement OR
  //            (A/V elements discovered from the Mutation Observer)
  //            A/V element's parentNode OR the node whose children changed.
  //   div = Controller's DOM element (which happens to be a DIV)
  //   speedIndicator = DOM element in the Controller of the speed indicator

  // added to AUDIO / VIDEO DOM elements
  //    vsc = reference to the videoController
  tc.videoController = function (target, parent) {
    if (target.vsc) {
      return target.vsc;
    }

    tc.mediaElements.push(target);

    this.video = target;
    this.parent = target.parentElement || parent;
    let storedSpeed = tc.settings.speeds[target.currentSrc];
    if (!tc.settings.rememberSpeed) {
      if (!storedSpeed) {
        logger.log(
          "Overwriting stored speed to 1.0 due to rememberSpeed being disabled",
          5
        );
        storedSpeed = 1.0;
      }
      setKeyBindings("reset", getKeyBindings("fast")); // resetSpeed = fastSpeed
    } else {
      logger.log(
        "Recalling stored speed due to rememberSpeed being enabled",
        5
      );
      storedSpeed = tc.settings.lastSpeed;
    }

    logger.log("Explicitly setting playbackRate to: " + storedSpeed, 5);
    target.playbackRate = storedSpeed;

    this.div = this.initializeControls();

    var mediaEventAction = function (event) {
      storedSpeed = tc.settings.speeds[event.target.currentSrc];
      if (!tc.settings.rememberSpeed) {
        if (!storedSpeed) {
          logger.log(
            "Overwriting stored speed to 1.0 (rememberSpeed not enabled)",
            4
          );
          storedSpeed = 1.0;
        }
        // resetSpeed isn't really a reset, it's a toggle
        logger.log("Setting reset keybinding to fast", 5);
        setKeyBindings("reset", getKeyBindings("fast")); // resetSpeed = fastSpeed
      } else {
        logger.log(
          "Storing lastSpeed into tc.settings.speeds (rememberSpeed enabled)",
          5
        );
        storedSpeed = tc.settings.lastSpeed;
      }
      // TODO: Check if explicitly setting the playback rate to 1.0 is
      // necessary when rememberSpeed is disabled (this may accidentally
      // override a website's intentional initial speed setting interfering
      // with the site's default behavior)
      logger.log("Explicitly setting playbackRate to: " + storedSpeed, 4);
      setSpeed(event.target, storedSpeed);
    };

    target.addEventListener(
      "play",
      (this.handlePlay = mediaEventAction.bind(this))
    );

    target.addEventListener(
      "seeked",
      (this.handleSeek = mediaEventAction.bind(this))
    );

    var observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "src" ||
            mutation.attributeName === "currentSrc")
        ) {
          logger.log("mutation of A/V element", 5);
          var controller = this.div;
          if (!mutation.target.src && !mutation.target.currentSrc) {
            controller.classList.add("vsc-nosource");
          } else {
            controller.classList.remove("vsc-nosource");
          }
        }
      });
    });
    observer.observe(target, {
      attributeFilter: ["src", "currentSrc"],
    });
  };

  tc.videoController.prototype.remove = function () {
    this.div.remove();
    this.video.removeEventListener("play", this.handlePlay);
    this.video.removeEventListener("seek", this.handleSeek);
    delete this.video.vsc;
    let idx = tc.mediaElements.indexOf(this.video);
    if (idx != -1) {
      tc.mediaElements.splice(idx, 1);
    }
  };

  tc.videoController.prototype.initializeControls = function () {
    logger.log("initializeControls Begin", 5);
    const document = this.video.ownerDocument;
    const speed = this.video.playbackRate.toFixed(2);
    const rect = this.video.getBoundingClientRect();
    // getBoundingClientRect is relative to the viewport; style coordinates
    // are relative to offsetParent, so we adjust for that here. offsetParent
    // can be null if the video has `display: none` or is not yet in the DOM.
    const offsetRect = this.video.offsetParent?.getBoundingClientRect();
    const top = Math.max(rect.top - (offsetRect?.top || 0), 0) + "px";
    const left = Math.max(rect.left - (offsetRect?.left || 0), 0) + "px";

    logger.log("Speed variable set to: " + speed, 5);

    var wrapper = document.createElement("div");
    logger.log(`Created div: ${wrapper}`, 5);
    wrapper.classList.add("vsc-controller");
    logger.log(`Added class vsc-controller to div`, 5);

    if (!this.video.currentSrc) {
      wrapper.classList.add("vsc-nosource");
      logger.log(`Added class vsc-nosource to div`, 5);
    }

    if (tc.settings.startHidden) {
      wrapper.classList.add("vsc-hidden");
      logger.log(`Added class vsc-hidden to div`, 5);
    }

    var shadow = wrapper.attachShadow({ mode: "open" });
    logger.log(`Created shadowroot: ${shadow}`, 5);
    var shadowTemplate = `
        <style>
          ${shadow_css_tpl}
        </style>

        <div id="controller" style="top:${top}; left:${left}; opacity:${tc.settings.controllerOpacity}">
          <span data-action="drag" class="draggable">${speed}</span>
          <span id="controls">
            <button data-action="rewind" class="rw">«</button>
            <button data-action="slower">&minus;</button>
            <button data-action="faster">&plus;</button>
            <button data-action="advance" class="rw">»</button>
            <button data-action="display" class="hideButton">&times;</button>
          </span>
        </div>
      `;
    shadow.innerHTML = shadowTemplate;
    logger.log(`Applied template to shadroot: ${shadowTemplate}`, 5);
    shadow.querySelector(".draggable").addEventListener(
      "mousedown",
      (e) => {
        runAction(e.target.dataset["action"], false, e);
        e.stopPropagation();
      },
      true
    );
    logger.log(`Applied listener to ".draggable" class within shadow root`, 5);

    shadow.querySelectorAll("button").forEach(function (button) {
      button.addEventListener(
        "click",
        (e) => {
          runAction(
            e.target.dataset["action"],
            getKeyBindings(e.target.dataset["action"]),
            e
          );
          e.stopPropagation();
        },
        true
      );
    });
    logger.log(
      `Added click event listeners to all "button"s within shadowroot, stopped event propagation`,
      5
    );

    shadow
      .querySelector("#controller")
      .addEventListener("click", (e) => e.stopPropagation(), false);
    shadow
      .querySelector("#controller")
      .addEventListener("mousedown", (e) => e.stopPropagation(), false);

    this.speedIndicator = shadow.querySelector("span");
    var fragment = document.createDocumentFragment();
    fragment.appendChild(wrapper);

    switch (true) {
      case location.hostname == "www.amazon.com":
      case location.hostname == "www.reddit.com":
      case /hbogo\./.test(location.hostname):
        // insert before parent to bypass overlay
        this.parent.parentElement.insertBefore(fragment, this.parent);
        break;
      case location.hostname == "www.facebook.com":
        // this is a monstrosity but new FB design does not have *any*
        // semantic handles for us to traverse the tree, and deep nesting
        // that we need to bubble up from to get controller to stack correctly
        let p =
          this.parent.parentElement.parentElement.parentElement.parentElement
            .parentElement.parentElement.parentElement;
        p.insertBefore(fragment, p.firstChild);
        break;
      case location.hostname == "tv.apple.com":
        // insert before parent to bypass overlay
        this.parent.parentNode.insertBefore(
          fragment,
          this.parent.parentNode.firstChild
        );
        break;
      default:
        // Note: when triggered via a MutationRecord, it's possible that the
        // target is not the immediate parent. This appends the controller as
        // the first element of the target, which may not be the parent.
        this.parent.insertBefore(fragment, this.parent.firstChild);
    }
    return wrapper;
  };
}

function isBlacklisted() {
  logger.log("Checking if blacklisted", 5);
  let blacklisted = false;
  tc.settings.blacklist.split("\n").forEach((match) => {
    match = match.replace(regStrip, "");
    if (match.length == 0) {
      return;
    }

    if (match.startsWith("/")) {
      try {
        var parts = match.split("/");

        if (regEndsWithFlags.test(match)) {
          var flags = parts.pop();
          var regex = parts.slice(1).join("/");
        } else {
          var flags = "";
          var regex = match;
        }

        var regexp = new RegExp(regex, flags);
      } catch (err) {
        return;
      }
    } else {
      var regexp = new RegExp(regexEscapeString(match));
    }

    if (regexp.test(location.href)) {
      logger.log("Site blacklisted, disabling", 5);
      blacklisted = true;
      return;
    }
  });
  return blacklisted;
}

var coolDown = false;
function refreshCoolDown() {
  logger.log("Begin refreshCoolDown", 5);
  if (coolDown) {
    clearTimeout(coolDown);
  }
  coolDown = setTimeout(function () {
    coolDown = false;
  }, 1000);
  logger.log("End refreshCoolDown", 5);
}

function setupListener() {
  /**
   * This function is run whenever a video speed rate change occurs.
   * It is used to update the speed that shows up in the display as well as save
   * that latest speed into the local storage.
   *
   * @param {*} video The video element to update the speed indicators for.
   */
  function updateSpeedFromEvent(video) {
    // It's possible to get a rate change on a VIDEO/AUDIO that doesn't have
    // a video controller attached to it.  If we do, ignore it.
    if (!video.vsc) return;
    var speedIndicator = video.vsc.speedIndicator;
    var src = video.currentSrc;
    var speed = Number(video.playbackRate.toFixed(2));

    logger.log("Playback rate changed to " + speed, 4);

    logger.log("Updating controller with new speed", 5);
    speedIndicator.textContent = speed.toFixed(2);
    tc.settings.speeds[src] = speed;
    logger.log(
      "Storing lastSpeed in settings for the rememberSpeed feature",
      5
    );
    tc.settings.lastSpeed = speed;
    logger.log("Syncing chrome settings for lastSpeed", 5);
    chrome.storage.sync.set({ lastSpeed: speed }, function () {
      logger.log("Speed setting saved: " + speed, 5);
    });
    // show the controller for 1000ms if it's hidden.
    runAction("blink", null, null);
  }

  document.addEventListener(
    "ratechange",
    function (event) {
      if (coolDown) {
        logger.log("Speed event propagation blocked", 4);
        event.stopImmediatePropagation();
      }
      var video = event.target;

      /**
       * If the last speed is forced, only update the speed based on events created by
       * video speed instead of all video speed change events.
       */
      if (tc.settings.forceLastSavedSpeed) {
        if (event.detail && event.detail.origin === "videoSpeed") {
          video.playbackRate = event.detail.speed;
          updateSpeedFromEvent(video);
        } else {
          video.playbackRate = tc.settings.lastSpeed;
        }
        event.stopImmediatePropagation();
      } else {
        updateSpeedFromEvent(video);
      }
    },
    true
  );
}

function initializeWhenReady(document) {
  logger.log("Begin initializeWhenReady", 5);
  if (isBlacklisted()) {
    logger.log("Site is blacklisted, ending initializeWhenReady", 5);
    return;
  }
  logger.log("Site is not blacklisted, continuing initializeWhenReady", 5);
  window.onload = () => {
    initializeNow(window.document);
  };
  if (document) {
    if (document.readyState === "complete") {
      logger.log("Document ready, initializing", 5);
      initializeNow(document);
    } else {
      logger.log("Document not ready, adding listener", 5);
      document.onreadystatechange = () => {
        logger.log(
          `readystatechange listener fired, checking new ready state: ${document.readyState}`,
          5
        );
        if (document.readyState === "complete") {
          logger.log(`[listener] Document ready, initializing`, 5);
          initializeNow(document);
        }
      };
    }
  }
  logger.log("End initializeWhenReady", 5);
}
function inIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}
function getShadow(parent) {
  let result = [];
  function getChild(parent) {
    if (parent.firstElementChild) {
      var child = parent.firstElementChild;
      do {
        result.push(child);
        getChild(child);
        if (child.shadowRoot) {
          result.push(getShadow(child.shadowRoot));
        }
        child = child.nextElementSibling;
      } while (child);
    }
  }
  getChild(parent);
  return result.flat(Infinity);
}

function initializeNow(document) {
  logger.log("Begin initializeNow", 5);
  if (!tc.settings.enabled) return;
  // enforce init-once due to redundant callers
  if (!document.body || document.body.classList.contains("vsc-initialized")) {
    return;
  }
  try {
    setupListener();
  } catch {
    // no operation
  }
  document.body.classList.add("vsc-initialized");
  logger.log("initializeNow: vsc-initialized added to document body", 5);

  if (document === window.document) {
    defineVideoController();
  } else {
    var link = document.createElement("link");
    link.href = chrome.runtime.getURL("assets/css/content.css");
    link.type = "text/css";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  var docs = Array(document);
  try {
    if (inIframe()) docs.push(window.top.document);
  } catch (e) {}

  docs.forEach(function (doc) {
    doc.addEventListener(
      "keydown",
      function (event) {
        var keyCode = event.keyCode;
        logger.log("Processing keydown event: " + keyCode, 6);

        // Ignore if following modifier is active.
        if (
          !event.getModifierState ||
          event.getModifierState("Alt") ||
          event.getModifierState("Control") ||
          event.getModifierState("Fn") ||
          event.getModifierState("Meta") ||
          event.getModifierState("Hyper") ||
          event.getModifierState("OS")
        ) {
          logger.log(
            "Keydown event ignored due to active modifier: " + keyCode,
            5
          );
          return;
        }

        // Ignore keydown event if typing in an input box
        if (
          event.target.nodeName === "INPUT" ||
          event.target.nodeName === "TEXTAREA" ||
          event.target.isContentEditable
        ) {
          return false;
        }

        // Ignore keydown event if typing in a page without vsc
        if (!tc.mediaElements.length) {
          return false;
        }

        var item = tc.settings.keyBindings.find((item) => item.key === keyCode);
        if (item) {
          runAction(item.action, item.value);
          if (item.force === "true") {
            // disable websites key bindings
            event.preventDefault();
            event.stopPropagation();
          }
        }

        return false;
      },
      true
    );
  });

  function checkForVideo(node, parent, added) {
    // Only proceed with supposed removal if node is missing from DOM
    if (!added && document.body.contains(node)) {
      return;
    }
    if (
      node.nodeName === "VIDEO" ||
      (node.nodeName === "AUDIO" && tc.settings.audioBoolean)
    ) {
      if (added) {
        node.vsc = new tc.videoController(node, parent);
      } else {
        if (node.vsc) {
          node.vsc.remove();
        }
      }
    } else if (node.children != undefined) {
      for (var i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        checkForVideo(child, child.parentNode || parent, added);
      }
    }
  }

  var observer = new MutationObserver(function (mutations) {
    // Process the DOM nodes lazily
    requestIdleCallback(
      (_) => {
        mutations.forEach(function (mutation) {
          switch (mutation.type) {
            case "childList":
              mutation.addedNodes.forEach(function (node) {
                if (typeof node === "function") return;
                checkForVideo(node, node.parentNode || mutation.target, true);
              });
              mutation.removedNodes.forEach(function (node) {
                if (typeof node === "function") return;
                checkForVideo(node, node.parentNode || mutation.target, false);
              });
              break;
            case "attributes":
              if (
                (mutation.target.attributes["aria-hidden"] &&
                  mutation.target.attributes["aria-hidden"].value == "false") ||
                mutation.target.nodeName === "APPLE-TV-PLUS-PLAYER"
              ) {
                var flattenedNodes = getShadow(document.body);
                var nodes = flattenedNodes.filter((x) => x.tagName == "VIDEO");
                for (let node of nodes) {
                  // only add vsc the first time for the apple-tv case (the attribute change is triggered every time you click the vsc)
                  if (
                    node.vsc &&
                    mutation.target.nodeName === "APPLE-TV-PLUS-PLAYER"
                  )
                    continue;
                  if (node.vsc) node.vsc.remove();
                  checkForVideo(node, node.parentNode || mutation.target, true);
                }
              }
              break;
          }
        });
      },
      { timeout: 1000 }
    );
  });
  observer.observe(document, {
    attributeFilter: ["aria-hidden", "data-focus-method"],
    childList: true,
    subtree: true,
  });

  if (tc.settings.audioBoolean) {
    var mediaTags = document.querySelectorAll("video,audio");
  } else {
    var mediaTags = document.querySelectorAll("video");
  }

  mediaTags.forEach(function (video) {
    video.vsc = new tc.videoController(video);
  });

  var frameTags = document.getElementsByTagName("iframe");
  Array.prototype.forEach.call(frameTags, function (frame) {
    // Ignore frames we don't have permission to access (different origin).
    try {
      var childDocument = frame.contentDocument;
    } catch (e) {
      return;
    }
    initializeWhenReady(childDocument);
  });
  logger.log("End initializeNow", 5);
}

function setSpeed(video, speed) {
  logger.log("setSpeed started: " + speed, 5);
  var speedvalue = speed.toFixed(2);
  if (tc.settings.forceLastSavedSpeed) {
    video.dispatchEvent(
      new CustomEvent("ratechange", {
        detail: { origin: "videoSpeed", speed: speedvalue },
      })
    );
  } else {
    video.playbackRate = Number(speedvalue);
  }
  var speedIndicator = video.vsc.speedIndicator;
  speedIndicator.textContent = speedvalue;
  tc.settings.lastSpeed = speed;
  refreshCoolDown();
  logger.log("setSpeed finished: " + speed, 5);
}

function runAction(action, value, e) {
  logger.log("runAction Begin", 5);

  var mediaTags = tc.mediaElements;

  // Get the controller that was used if called from a button press event e
  if (e) {
    var targetController = e.target.getRootNode().host;
  }

  mediaTags.forEach(function (v) {
    var controller = v.vsc.div;

    // Don't change video speed if the video has a different controller
    if (e && !(targetController == controller)) {
      return;
    }

    showController(controller);

    if (!v.classList.contains("vsc-cancelled")) {
      if (action === "rewind") {
        logger.log("Rewind", 5);
        v.currentTime -= value;
      } else if (action === "advance") {
        logger.log("Fast forward", 5);
        v.currentTime += value;
      } else if (action === "faster") {
        logger.log("Increase speed", 5);
        // Maximum playback speed in Chrome is set to 16:
        // https://cs.chromium.org/chromium/src/third_party/blink/renderer/core/html/media/html_media_element.cc?gsn=kMinRate&l=166
        var s = Math.min(
          (v.playbackRate < 0.1 ? 0.0 : v.playbackRate) + value,
          16
        );
        setSpeed(v, s);
      } else if (action === "slower") {
        logger.log("Decrease speed", 5);
        // Video min rate is 0.0625:
        // https://cs.chromium.org/chromium/src/third_party/blink/renderer/core/html/media/html_media_element.cc?gsn=kMinRate&l=165
        var s = Math.max(v.playbackRate - value, 0.07);
        setSpeed(v, s);
      } else if (action === "reset") {
        logger.log("Reset speed", 5);
        resetSpeed(v, 1.0);
      } else if (action === "display") {
        logger.log("Showing controller", 5);
        controller.classList.add("vsc-manual");
        controller.classList.toggle("vsc-hidden");
      } else if (action === "blink") {
        logger.log("Showing controller momentarily", 5);
        // if vsc is hidden, show it briefly to give the use visual feedback that the action is excuted.
        if (
          controller.classList.contains("vsc-hidden") ||
          controller.blinkTimeOut !== undefined
        ) {
          clearTimeout(controller.blinkTimeOut);
          controller.classList.remove("vsc-hidden");
          controller.blinkTimeOut = setTimeout(
            () => {
              controller.classList.add("vsc-hidden");
              controller.blinkTimeOut = undefined;
            },
            value ? value : 1000
          );
        }
      } else if (action === "drag") {
        handleDrag(v, e);
      } else if (action === "fast") {
        resetSpeed(v, value);
      } else if (action === "pause") {
        pause(v);
      } else if (action === "muted") {
        muted(v);
      } else if (action === "mark") {
        setMark(v);
      } else if (action === "jump") {
        jumpToMark(v);
      } else if (action === "fullscreen") {
        switchFullscreen(v);
      }
    }
  });
  logger.log("runAction End", 5);
}

function pause(v) {
  if (v.paused) {
    logger.log("Resuming video", 5);
    v.play();
  } else {
    logger.log("Pausing video", 5);
    v.pause();
  }
}

function resetSpeed(v, target) {
  if (v.playbackRate === target) {
    if (v.playbackRate === getKeyBindings("reset")) {
      if (target !== 1.0) {
        logger.log("Resetting playback speed to 1.0", 4);
        setSpeed(v, 1.0);
      } else {
        logger.log('Toggling playback speed to "fast" speed', 4);
        setSpeed(v, getKeyBindings("fast"));
      }
    } else {
      logger.log('Toggling playback speed to "reset" speed', 4);
      setSpeed(v, getKeyBindings("reset"));
    }
  } else {
    logger.log('Toggling playback speed to "reset" speed', 4);
    setKeyBindings("reset", v.playbackRate);
    setSpeed(v, target);
  }
}

function muted(v) {
  v.muted = v.muted !== true;
}

function setMark(v) {
  logger.log("Adding marker", 5);
  v.vsc.mark = v.currentTime;
}

function jumpToMark(v) {
  logger.log("Recalling marker", 5);
  if (v.vsc.mark && typeof v.vsc.mark === "number") {
    v.currentTime = v.vsc.mark;
  }
}

function waitEnough(waitObj, timeout) {
  // 通过多次异步，尽量等待其他js执行完毕，避免可能页面刚打开时原本的js还没执行完，比如可能变成先执行我们的全屏操作
  let count = 0, total = 20;
  let firstId;
  let startTime = new Date().getTime();
  return new Promise((resolve, reject) => {

    clearTimeout(waitObj.timeoutId);

    function nextTime() {
      let id = setTimeout(() => {
        count++;
        if (count >= total) {
          let endTime = new Date().getTime();
          let gap = endTime - startTime;
          console.debug("waitEnough", startTime, endTime, gap);
          resolve();
        } else {
          nextTime();
        }
      }, timeout / total);

      if (!firstId) {
        firstId = waitObj.timeoutId = id;
      }
    }

    nextTime();

  }).then(value => {
    if (firstId !== waitObj.timeoutId) {
      return Promise.reject();
    }
  });
}

var waitObj = {timeoutId: undefined};
function switchFullscreen(v) {
  // logger.log("switchFullscreen", 5);
  var item = tc.settings.keyBindings.find((item) => item.action === 'fullscreen');
  if (item && !item.force) {
    // use a delay way to avoid affecting website's fullscreen method
    if (!document.fullscreenElement) {
      waitEnough(waitObj, 200).then(() => {
        if (!document.fullscreenElement) {
          v.requestFullscreen();
        }
      }, () => {})
    } else {
      waitEnough(waitObj, 200).then(() => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }, () => {})
    }
    return;
  }
  if (!document.fullscreenElement) {
    v.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

function handleDrag(video, e) {
  const controller = video.vsc.div;
  const shadowController = controller.shadowRoot.querySelector("#controller");

  // Find nearest parent of same size as video parent.
  var parentElement = controller.parentElement;
  while (
    parentElement.parentNode &&
    parentElement.parentNode.offsetHeight === parentElement.offsetHeight &&
    parentElement.parentNode.offsetWidth === parentElement.offsetWidth
  ) {
    parentElement = parentElement.parentNode;
  }

  video.classList.add("vcs-dragging");
  shadowController.classList.add("dragging");

  const initialMouseXY = [e.clientX, e.clientY];
  const initialControllerXY = [
    parseInt(shadowController.style.left),
    parseInt(shadowController.style.top),
  ];

  const startDragging = (e) => {
    let style = shadowController.style;
    let dx = e.clientX - initialMouseXY[0];
    let dy = e.clientY - initialMouseXY[1];
    style.left = initialControllerXY[0] + dx + "px";
    style.top = initialControllerXY[1] + dy + "px";
  };

  const stopDragging = () => {
    parentElement.removeEventListener("mousemove", startDragging);
    parentElement.removeEventListener("mouseup", stopDragging);
    parentElement.removeEventListener("mouseleave", stopDragging);

    shadowController.classList.remove("dragging");
    video.classList.remove("vcs-dragging");
  };

  parentElement.addEventListener("mouseup", stopDragging);
  parentElement.addEventListener("mouseleave", stopDragging);
  parentElement.addEventListener("mousemove", startDragging);
}

var timer = null;
function showController(controller) {
  logger.log("Showing controller", 4);
  controller.classList.add("vcs-show");

  if (timer) clearTimeout(timer);

  timer = setTimeout(function () {
    controller.classList.remove("vcs-show");
    timer = false;
    logger.log("Hiding controller", 5);
  }, 2000);
}
