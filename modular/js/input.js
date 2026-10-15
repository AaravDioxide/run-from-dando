// js/input.js — Keyboard & multitouch input, conflict-free key remapping, and hidden /iamacheater console handler

import { CONFIG } from './config.js';

export class InputManager {
  constructor(saveManager) {
    this.saveManager = saveManager;
    this.heldCodes = new Set();
    this.oneShotActions = {
      dodge: false,
      ability: false,
      pause: false,
      confirm: false
    };

    this.joyActive = false;
    this.joyTouchId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.joyVector = { x: 0, y: 0 };
    this.maxJoyRadius = 48;
    this.touchSprintToggled = false;
    this.mouseSprintHeld = false;
    this.btnSprintEl = null;

    this.listeningForKeyCallback = null;
    this.onCancelListenCallback = null;

    this.typedBuffer = '';
    this.cheatsUnlocked = false;
    this.onActivateCheats = null;
    this.onExecuteCheatNumber = null;

    this._bindEvents();
  }

  static formatKeyCode(code) {
    if (!code) return '---';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    const map = {
      Space: 'SPACE',
      ShiftLeft: 'L-SHIFT',
      ShiftRight: 'R-SHIFT',
      ControlLeft: 'L-CTRL',
      ControlRight: 'R-CTRL',
      AltLeft: 'L-ALT',
      AltRight: 'R-ALT',
      Escape: 'ESC',
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
      Enter: 'ENTER',
      Tab: 'TAB',
      Backspace: 'BKSP'
    };
    return map[code] || code.toUpperCase();
  }

  _getKeybinds() {
    return this.saveManager?.data?.settings?.keybinds || CONFIG.DEFAULT_KEYS;
  }

  _isBoundElsewhere(code, targetAction, binds) {
    for (const [act, boundCode] of Object.entries(binds)) {
      if (act !== targetAction && boundCode === code) return true;
    }
    return false;
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      // FIXED: Escape cancels keybind listening instead of binding Escape or leaking listening state
      if (this.listeningForKeyCallback) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          this.cancelListeningForKey();
          return;
        }
        const cb = this.listeningForKeyCallback;
        this.listeningForKeyCallback = null;
        this.onCancelListenCallback = null;
        cb(e.code);
        return;
      }

      if (e.repeat) return;

      const activeEl = document.activeElement;
      const tag = activeEl?.tagName;
      const inTextInput = (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA');
      const onInteractiveButton = (tag === 'BUTTON' || tag === 'A' || activeEl?.getAttribute('role') === 'button');

      // Prevent browser Quick Find on '/' when typing /iamacheater
      if (e.key === '/' && !inTextInput) {
        e.preventDefault();
      }

      // Track typed character sequence for "/iamacheater" or "iamacheater"
      if (typeof e.key === 'string' && e.key.length === 1 && !inTextInput) {
        this.typedBuffer = (this.typedBuffer + e.key.toLowerCase()).slice(-24);
        if (this.typedBuffer.endsWith('/iamacheater') || this.typedBuffer.endsWith('iamacheater')) {
          this.typedBuffer = '';
          this.unlockCheats();
          return;
        }
      }

      // If Cheater Mode is unlocked, number keys 0-9 trigger cheats
      if (this.cheatsUnlocked && !inTextInput && /^Digit[0-9]$/.test(e.code)) {
        const digit = Number(e.code.replace('Digit', ''));
        if (this.onExecuteCheatNumber) {
          this.onExecuteCheatNumber(digit);
        }
        return;
      }

      if (inTextInput) {
        if (e.code === 'Escape') {
          activeEl.blur();
        }
        return;
      }

      const binds = this._getKeybinds();
      this.heldCodes.add(e.code);

      if (e.code === binds.dodge) {
        this.oneShotActions.dodge = true;
      }
      if (e.code === binds.ability) {
        this.oneShotActions.ability = true;
      }
      if (e.code === binds.pause || e.code === 'Escape') {
        this.oneShotActions.pause = true;
      }
      if (e.code === 'Enter' && !onInteractiveButton) {
        this.oneShotActions.confirm = true;
      }

      // Allow Space to activate focused UI buttons when not in active gameplay
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      } else if (e.code === 'Space' && !onInteractiveButton) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.heldCodes.delete(e.code);
    });

    // FIXED: Release any held mouse sprint anywhere on window so sprint never sticks if released outside button
    const releasePointerSprint = () => {
      if (this.mouseSprintHeld) {
        this.mouseSprintHeld = false;
        this._syncSprintButtonVisual();
      }
    };
    window.addEventListener('mouseup', releasePointerSprint);
    window.addEventListener('pointerup', releasePointerSprint);
    window.addEventListener('pointercancel', releasePointerSprint);

    window.addEventListener('blur', () => this.clearAllInputs());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.clearAllInputs();
      }
    });
  }

  unlockCheats() {
    this.cheatsUnlocked = true;
    if (this.onActivateCheats) {
      this.onActivateCheats();
    }
  }

  _syncSprintButtonVisual() {
    if (!this.btnSprintEl) return;
    const active = this.touchSprintToggled || this.mouseSprintHeld;
    this.btnSprintEl.classList.toggle('active-touch', active);
    this.btnSprintEl.setAttribute('aria-pressed', String(active));
  }

  bindMobileControls(joystickZoneEl, joystickKnobEl, btnDodgeEl, btnSprintEl, btnAbilityEl) {
    if (!joystickZoneEl || !joystickKnobEl) return;
    this.btnSprintEl = btnSprintEl;

    const updateKnob = (dx, dy) => {
      joystickKnobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };

    joystickZoneEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (!this.joyActive) {
          this.joyActive = true;
          this.joyTouchId = touch.identifier;
          const rect = joystickZoneEl.getBoundingClientRect();
          this.joyOrigin = {
            x: rect.left + rect.width * 0.5,
            y: rect.top + rect.height * 0.5
          };
          this._updateJoystickFromPoint(touch.clientX, touch.clientY, updateKnob);
          break;
        }
      }
    }, { passive: false });

    joystickZoneEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.joyActive) return;
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.joyTouchId) {
          this._updateJoystickFromPoint(touch.clientX, touch.clientY, updateKnob);
          break;
        }
      }
    }, { passive: false });

    const endJoy = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.joyTouchId) {
          this.joyActive = false;
          this.joyTouchId = null;
          this.joyVector = { x: 0, y: 0 };
          updateKnob(0, 0);
          break;
        }
      }
    };

    joystickZoneEl.addEventListener('touchend', endJoy, { passive: false });
    joystickZoneEl.addEventListener('touchcancel', endJoy, { passive: false });

    if (btnDodgeEl) {
      btnDodgeEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.oneShotActions.dodge = true;
      }, { passive: false });
      btnDodgeEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.oneShotActions.dodge = true;
      });
    }

    // FIXED: Mobile SPRINT is now a toggle on tap (so right thumb can freely tap DODGE/SKILL while sprinting),
    // and desktop mouse press tracks release on window so it never gets stuck.
    if (btnSprintEl) {
      btnSprintEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.touchSprintToggled = !this.touchSprintToggled;
        this._syncSprintButtonVisual();
      }, { passive: false });
      btnSprintEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.mouseSprintHeld = true;
        this._syncSprintButtonVisual();
      });
    }

    if (btnAbilityEl) {
      btnAbilityEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.oneShotActions.ability = true;
      }, { passive: false });
      btnAbilityEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.oneShotActions.ability = true;
      });
    }
  }

  _updateJoystickFromPoint(clientX, clientY, updateKnob) {
    const dx = clientX - this.joyOrigin.x;
    const dy = clientY - this.joyOrigin.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, this.maxJoyRadius);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 2 ? Math.cos(angle) * clamped : 0;
    const ky = dist > 2 ? Math.sin(angle) * clamped : 0;

    this.joyVector.x = kx / this.maxJoyRadius;
    this.joyVector.y = ky / this.maxJoyRadius;
    updateKnob(kx, ky);
  }

  getInputState() {
    const binds = this._getKeybinds();
    let moveX = 0;
    let moveY = 0;

    const upPressed = this.heldCodes.has(binds.up) || (!this._isBoundElsewhere('ArrowUp', 'up', binds) && this.heldCodes.has('ArrowUp'));
    const downPressed = this.heldCodes.has(binds.down) || (!this._isBoundElsewhere('ArrowDown', 'down', binds) && this.heldCodes.has('ArrowDown'));
    const leftPressed = this.heldCodes.has(binds.left) || (!this._isBoundElsewhere('ArrowLeft', 'left', binds) && this.heldCodes.has('ArrowLeft'));
    const rightPressed = this.heldCodes.has(binds.right) || (!this._isBoundElsewhere('ArrowRight', 'right', binds) && this.heldCodes.has('ArrowRight'));

    if (upPressed) moveY -= 1;
    if (downPressed) moveY += 1;
    if (leftPressed) moveX -= 1;
    if (rightPressed) moveX += 1;

    const joyMag = Math.hypot(this.joyVector.x, this.joyVector.y);
    if (this.joyActive && joyMag > 0.05) {
      moveX = this.joyVector.x;
      moveY = this.joyVector.y;
    }

    // Auto-sprint when virtual joystick is pushed to full deflection (>= 92%) or sprint toggle is active
    const joyFullPush = this.joyActive && joyMag >= 0.92;

    const sprint =
      this.heldCodes.has(binds.sprint) ||
      (!this._isBoundElsewhere('ShiftRight', 'sprint', binds) && this.heldCodes.has('ShiftRight')) ||
      this.touchSprintToggled ||
      this.mouseSprintHeld ||
      joyFullPush;

    const state = {
      moveX,
      moveY,
      sprint,
      dodgePressed: this.oneShotActions.dodge,
      abilityPressed: this.oneShotActions.ability,
      pausePressed: this.oneShotActions.pause,
      confirmPressed: this.oneShotActions.confirm
    };

    this.oneShotActions.dodge = false;
    this.oneShotActions.ability = false;
    this.oneShotActions.pause = false;
    this.oneShotActions.confirm = false;

    return state;
  }

  listenForNextKey(callback, onCancel = null) {
    this.listeningForKeyCallback = callback;
    this.onCancelListenCallback = onCancel;
  }

  cancelListeningForKey() {
    this.listeningForKeyCallback = null;
    if (this.onCancelListenCallback) {
      const cb = this.onCancelListenCallback;
      this.onCancelListenCallback = null;
      cb();
    }
  }

  clearAllInputs() {
    this.heldCodes.clear();
    this.oneShotActions.dodge = false;
    this.oneShotActions.ability = false;
    this.oneShotActions.pause = false;
    this.oneShotActions.confirm = false;
    this.joyActive = false;
    this.joyTouchId = null;
    this.joyVector = { x: 0, y: 0 };
    this.touchSprintToggled = false;
    this.mouseSprintHeld = false;
    this._syncSprintButtonVisual();
  }
}
