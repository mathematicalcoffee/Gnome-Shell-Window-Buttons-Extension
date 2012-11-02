/*global log, global */ // <-- for jshint
/* Window Button GNOME shell extension.
 * Copyright (C) 2011 Josiah Messiah (josiah.messiah@gmail.com)
 * Licence: GPLv3
 *
 * Contributors:
 * - Josiah Messiah <josiah.messiah@gmail.com>
 * - barravi <https://github.com/barravi>
 * - tiper <https://github.com/tiper>
 * - mathematical.coffee <mathematical.coffee@gmail.com>
 * - cjclavijo
 *
 * Note: this version (for GNOME 3.2 distributed by extensions.gnome.org) does
 * not use gsettings like the old github version did, because that had to be
 * installed in /usr/share which requires root permissions.
 *
 * Instead, change settings by editting extension.js (In GNOME 3.4 you can
 * use gnome-shell-extension-prefs and gsettings instead of this).
 *
 */

/*** GNOME 3.2: CONFIGURE THE EXTENSION HERE ***/

// [leave this alone] Keep enums in sync with GSettings schemas
const PinchType = {
    CUSTOM: 0,
    METACITY: 1,
    GNOME_SHELL: 2
};

// [leave this alone] Which box to place things in.
const Boxes = {
    LEFT: 0,
    RIGHT: 1,
    MIDDLE: 2
};


// [leave this alone] When to display the buttons.
const ShowButtonsWhen = {
    ALWAYS: 0,                    // Show buttons all the time.
    WINDOWS: 1,                   // Show buttons whenever windows exist
                                  //  (hides when no apps open)
    WINDOWS_VISIBLE: 2,           // Show buttons whenever *visible* windows
                                  //  exist (as previous, but will also hide if
                                  //  all windows are minimized)
    CURRENT_WINDOW_MAXIMIZED: 3,  // Show buttons only when the current window
                                  //  is maximized.
    ANY_WINDOW_MAXIMIZED: 4,      // Show buttons when there is *any* maximized
                                  //  window (in which case the uppermost
                                  //  maximized window will be affected, which
                                  //  may or may not be the current window!)
    ANY_WINDOW_FOCUSED: 5         // Only show buttons when a window is focused
                                  // (e.g. no window is focused if Nautilus is
                                  // managin the desktop and it is selected)
};

// When should we show the buttons? (default: they are visible if and only if
// there are windows on your workspace).
// See ShowButtonsWhen above for an explanation of the options.
const showbuttons = ShowButtonsWhen.WINDOWS;

// should buttons hide in the overview (in addition to whatever `showbuttons` says)?
const hideinoverview = true;

// The order of the window buttons (e.g. :minimize,maximize,close).
// Colon splits the buttons into two groups, left and right, which can be
// positioned separately.
// If you wish to use this order (rather than the Mutter/Metacity one), you must
// set the 'pinch' variable below to PinchType.CUSTOM.
const order = ':minimize,maximize,close';

// Use custom button order or pinch order settings from mutter/metacity.
// Options: PinchType.METACITY  (use /apps/metacity/general/button_layout)
//          PinchType.GNOME_SHELL(use org.gnome.shell.overrides.button-layout
//                                == /desktop/gnome/shell/windows/button_layout)
//          PinchType.CUSTOM    (use the 'order' variable above)
const pinch = PinchType.METACITY;

// The name of the theme to use (the name of one of the folders in 'themes')
const theme = 'default';

// Should we take the theme from the current Metacity theme instead
// (/apps/metacity/general/theme)? If true this will OVERRIDE the above 'theme'.
const doMetacity = false;



// How to position the left and right groups of buttons.
// The position is defined by two properties: 'box' and 'position'.
//
// The 'box' value is which box in the top panel to put the buttons in:
// * Boxes.LEFT means in the left box (usually holds the activities and
//   window title buttons)
// * Boxes.MIDDLE means the centre box (usually holds the date/time, unless
//   you have an extension that moves the clock to the right for you)
// * Boxes.RIGHT means the right box (status area, user menu).
//
// The 'position' value is where *within* the box you want the buttons to be
// placed.
// Example: 1 means you want them to be the 'first item from the left', 2 means
//  they'll be the 'second item from the left', and so on.
// -1 means it'll be the first item from the *right*, -2 means second item from
//  the right, and so on.
// (Don't set it to 0: this will have undefined behaviour).
// EXAMPLES:
// Put as the right-most item in the status bar:
//     box: Boxes.RIGHT,
//     position: -1
// Put as the left-most item in the status bar (i.e. after the title bar but
//  as far right as possible):
//     box: Boxes.RIGHT,
//     position: 1
// Put right after the title-bar (no gap in between):
//     box: Boxes.LEFT,
//     position: -1
// Put in before the title-bar (between 'Activities' and the title bar):
//     box: Boxes.LEFT,
//     position: 2
const buttonPosition = {
    left: {
        // Position of the left group of buttons (if any). Change as you like.
        // Default: between the activities bar and the app menu, i.e. second
        //  item from the left in the left box.
        box: Boxes.LEFT,
        position: 2
    },

    right: {
        // Position of the right group of buttons (if any). Change as you like.
        // Default: after the title bar as far right as possible, i.e. the first
        // item from the left in the right box.
        box: Boxes.RIGHT,
        position: 1
    }
};


/*********** CODE. LEAVE THE FOLLOWING **************/
const Lang = imports.lang;
const St = imports.gi.St;
const GConf = imports.gi.GConf;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;

let extensionPath = "";

// Laziness
Meta.MaximizeFlags.BOTH = (Meta.MaximizeFlags.HORIZONTAL |
    Meta.MaximizeFlags.VERTICAL);

const _ORDER_DEFAULT = ":minimize,maximize,close";
const DCONF_META_PATH = 'org.gnome.desktop.wm.preferences';

/********************
 * Helper functions *
 ********************/
function warn(msg) {
    log("WARNING [Window Buttons]: " + msg);
}

/* Get the metacity button layout.
 * On GNOME 3.2, this can be found in GCONF key
 * /apps/metacity/general/button_layout. On GNOME 3.4, the gconf key does not
 * exist and you must use org.gnome.desktop.wm.preferences button-layout.
 */
function getMetaButtonLayout() {
    // try Gio.Settings first. Cannot query non-existant schema in 3.2 or
    // we'll get a segfault.
    let order;
    try {
        // the following code will *only* work in GNOME 3.4 (schema_id property
        // is 'schema' in GNOME 3.2):
        order = new Gio.Settings({schema_id: DCONF_META_PATH}).get_string(
            'button-layout');
    } catch (err) {
        // GNOME 3.2
        order = GConf.Client.get_default().get_string(
                "/apps/metacity/general/button_layout");
    }
    return order;
}

/* convert Boxes.{LEFT,RIGHT,MIDDLE} into
 * Main.panel.{_leftBox, _rightBox, _centerBox}
 */
function getBox(boxEnum) {
    let box = null;
    switch (boxEnum) {
    case Boxes.MIDDLE:
        box = Main.panel._centerBox;
        break;
    case Boxes.LEFT:
        box = Main.panel._leftBox;
        break;
    case Boxes.RIGHT:
        /* falls through */
    default:
        box = Main.panel._rightBox;
        break;
    }
    return box;
}

/* Get the number of *visible* children in an actor. */
function getNChildren(act) {
    return act.get_children().filter(function (c) { return c.visible; }).length;
}

/* Convert position.{left,right}.position to a position that insert_actor can
 * handle.
 * Here 'position' is the position you want  amongst all
 * *visible* children of actor.
 * (e.g. for me on GNOME 3.4 the bluetooth indicator is a child of
 * Main.panel._leftBox, but isn't visible because I don't have bluetooth.
 */
function getPosition(actor, position, nvisible) {
    if (position < 0) {
        let n = actor.get_children().length;
        if (nvisible !== n && nvisible > 0) {
            // you want to get the `position`th item amongst the *visible*
            // children, but you have to call insert_actor on an index amongst
            // *all* children of actor.
            let pos = 0,
                nvis = 0,
                children = actor.get_children();
            for (let i = n - 1; i >= 0 && nvis < -position; --i) {
                pos -= 1;
                if (children[i].visible) {
                    nvis++;
                }
            }
            position = pos;
        }
        return n + position + 1;
    } else { // position 1 ("first item on the left") is index 0
        let n = actor.get_children().length;
        if (nvisible !== n && nvisible > 0) {
            let nvis = 0,
                pos = 0,
                children = actor.get_children();
            for (let i = 0; i < n && nvis < position; ++i) {
                pos += 1;
                if (children[i].visible) {
                    nvis++;
                }
            }
            position = pos;
        }
        return Math.max(0, position - 1);
    }
}

/************************
 * Window Buttons class *
 ************************/
function WindowButtons() {
    this._init();
}

WindowButtons.prototype = {
    __proto__: PanelMenu.ButtonBox.prototype,

    _init: function () {
        this._wmSignals = [];
        this._overviewSignals = [];
        this._windowTrackerSignal = 0;
    },

    _loadTheme: function () {
        let newtheme = theme;
        if (doMetacity) {
            newtheme = Meta.prefs_get_theme();
        }

        // if still no theme, use the old one or 'default'
        if (!newtheme) {
            warn("Could not load the requested theme.");
            newtheme = theme || 'default';
        }

        // Get CSS of new theme, and check it exists, falling back to 'default'
        let cssPath = GLib.build_filenamev([extensionPath, 'themes', newtheme,
                                            'style.css']);
        if (!GLib.file_test(cssPath, GLib.FileTest.EXISTS)) {
            cssPath = GLib.build_filenamev([extensionPath,
                                            'themes/default/style.css']);
        }

        let themeContext = St.ThemeContext.get_for_stage(global.stage),
            currentTheme = themeContext.get_theme();

        // load the new style
        currentTheme.load_stylesheet(cssPath);

        // The following forces the new style to reload (it may not be the only
        // way to do it; running the cursor over the buttons works too)
        this.rightActor.grab_key_focus();
        this.leftActor.grab_key_focus();
    },

    _display: function () {
        // TODO: if order changes I don't have to destroy all the children,
        // I can just re-insert them!

        let boxes = [ this.leftBox, this.rightBox ];
        for (let box = 0; box < boxes.length; ++box) {
            let children = boxes[box].get_children();
            for (let i = 0; i < children.length; ++i) {
                children[i].destroy();
            }
        }

        if (pinch === PinchType.METACITY) {
            order = getMetaButtonLayout();
        } else if (pinch === PinchType.GNOME_SHELL) {
            order = Gio.Settings.new('org.gnome.shell.overrides').get_string(
                    'button-layout');
        }
        // otherwise, we end up with 'order' specified up the top
        /* If still no joy, use a default of :minimize,maximize,close ... */
        if (!order || !order.length) {
            order = _ORDER_DEFAULT;
        }


        let buttonlist = {  minimize : ['Minimize', this._minimize],
                            maximize : ['Maximize', this._maximize],
                            close    : ['Close', this._close] },
            orders     = order.replace(/ /g, '').split(':');

        /* Validate order */
        if (orders.length === 1) {
            // didn't have a ':'
            warn("Malformed order (no ':'), will insert at the front.");
            orders = ['', orders[0]];
        }

        let orderLeft  = orders[0].split(','),
            orderRight = orders[1].split(',');

        if (orderRight != "") {
            for (let i = 0; i < orderRight.length; ++i) {
                if (!buttonlist[orderRight[i]]) {
                    // skip if the butto name is not right...
                    warn("\'%s\' is not a valid button.".format(
                                orderRight[i]));
                    continue;
                }
                let button = new St.Button({
                    style_class: orderRight[i]  + ' window-button',
                    track_hover: true
                });
                button.set_tooltip_text(buttonlist[orderRight[i]][0]);
                button.connect('button-press-event', Lang.bind(this,
                            buttonlist[orderRight[i]][1]));
                this.rightBox.add(button);
            }
        }

        if (orderLeft != "") {
            for (let i = 0; i < orderLeft.length; ++i) {
                if (!buttonlist[orderLeft[i]]) {
                    warn("\'%s\' is not a valid button.".format(
                                orderLeft[i]));
                    // skip if the butto name is not right...
                    continue;
                }
                let button = new St.Button({
                    style_class: orderLeft[i] + ' window-button',
                    track_hover: true
                });
                button.set_tooltip_text(buttonlist[orderLeft[i]][0]);
                button.connect('button-press-event', Lang.bind(this,
                            buttonlist[orderLeft[i]][1]));
                this.leftBox.add(button);
            }
        }
    },

    /*
     * ShowButtonsWhen.ALWAYS, WINDOWS, WINDOWS_VISIBLE,
     * CURRENT_WINDOW_MAXIMIZED, ANY_WINDOW_MAXIMIZED, ANY_WINDOW_FOCUSED
     */
    _windowChanged: function () {
        let workspace = global.screen.get_active_workspace(),
            windows = workspace.list_windows().filter(function (w) {
                return w.get_window_type() !== Meta.WindowType.DESKTOP;
            }),
            show = false;

        // if overview is active won't show the buttons
        if (hideinoverview && Main.overview.visible) {
            show = false;
        } else {
            switch (showbuttons) {
            // show whenever there are windows
            case ShowButtonsWhen.WINDOWS:
                show = windows.length;
                break;
           
            // show whenever there are non-minimized windows
            case ShowButtonsWhen.WINDOWS_VISIBLE:
                for (let i = 0; i < windows.length; ++i) {
                    if (!windows[i].minimized) {
                        show = true;
                        break;
                    }
                }
                break;

            // show iff current window is (fully) maximized
            case ShowButtonsWhen.CURRENT_WINDOW_MAXIMIZED:
                let activeWindow = global.display.focus_window;
                show = (activeWindow ?
                        activeWindow.get_maximized() === Meta.MaximizeFlags.BOTH :
                        false);
                break;

            // show iff *any* window is (fully) maximized
            case ShowButtonsWhen.ANY_WINDOW_MAXIMIZED:
                for (let i = 0; i < windows.length; ++i) {
                    if (windows[i].get_maximized() === Meta.MaximizeFlags.BOTH) {
                        show = true;
                        break;
                    }
                }
                break;

            // show iff *any* window is focused.
            case ShowButtonsWhen.ANY_WINDOW_FOCUSED:
                show = global.display.focus_window;
                break;

            // show all the time
            case ShowButtonsWhen.ALWAYS:
                /* falls through */
            default:
                show = true;
                break;
            }
        }

        // if the actors already match `show` don't do anything.
        if (show === this.leftActor.visible &&
                show === this.rightActor.visible) {
            return false;
        }
        if (show) {
            this.leftActor.show();
            this.rightActor.show();
        } else {
            this.leftActor.hide();
            this.rightActor.hide();
        }
        return false;
    },

    // Returns the window to control.
    // This is:
    // * the currently focused window.
    // * onlymax is TRUE, in which case it is the uppermost *maximized*
    //   window, whether or not this is active or not. If there are no
    //   maximized windows, it defaults to:
    // * the currently focused window.
    // * if all else fails, we return the uppermost window.
    _getWindowToControl: function () {
        let win = global.display.focus_window,
            workspace = global.screen.get_active_workspace(),
            windows = workspace.list_windows().filter(function (w) {
                return w.get_window_type() !== Meta.WindowType.DESKTOP;
            });
        // BAH: list_windows() doesn't return in stackin order (I thought it did)
        windows = global.display.sort_windows_by_stacking(windows);

        if (win === null || win.get_window_type() === Meta.WindowType.DESKTOP) {
            // No windows are active, control the uppermost window on the
            // current workspace
            if (windows.length) {
                win = windows[windows.length - 1].get_meta_window();
            }
        }

        // Incorporate onlymax behaviour: get the uppermost maximized window
        if (showbuttons === ShowButtonsWhen.ANY_WINDOW_MAXIMIZED) {
            let i = windows.length;
            while (i--) {
                if (windows[i].get_maximized() === Meta.MaximizeFlags.BOTH &&
                        !windows[i].minimized) {
                    win = windows[i];
                    break;
                }
            }
        }
        return win;
    },

    _minimize: function () {
        let win = this._getWindowToControl();
        if (!win) {
            return;
        }

        // minimize/unmaximize
        if (win.minimized) {
            win.unminimize();
            win.activate(global.get_current_time());
        } else {
            win.minimize();
        }
    },

    _maximize: function () {
        let win = this._getWindowToControl();
        if (!win) {
            return;
        }

        // maximize/unmaximize. We count half-maximized as not maximized & will
        // fully maximize it.
        if (win.get_maximized() === Meta.MaximizeFlags.BOTH) {
            win.unmaximize(Meta.MaximizeFlags.BOTH);
        } else {
            win.maximize(Meta.MaximizeFlags.BOTH);
        }
        win.activate(global.get_current_time());
    },

    _close: function () {
        let win = this._getWindowToControl();
        if (!win) {
            return;
        }

        // close it.
        win.delete(global.get_current_time());
    },

    _connectSignals: function () {
        if (hideinoverview) {
            // listen to the overview showing & hiding.
            this._overviewSignals.push(Main.overview.connect('shown',
                Lang.bind(this, this._windowChanged)));
            this._overviewSignals.push(Main.overview.connect('hidden',
                Lang.bind(this, this._windowChanged)));
        }

        // if we show the buttons as long as a window is focused it is sufficient
        // to listen to notify::focus-app (a window is focused if and only if an
        // its app is focused .. (?))
        if (showbuttons === ShowButtonsWhen.ANY_WINDOW_FOCUSED) {
            this._windowTrackerSignal = Shell.WindowTracker.get_default().connect(
                    'notify::focus-app', Lang.bind(this, this._windowChanged));
            return;
        }

        // if we are always showing the buttons then we don't have to listen
        // to window events
        if (showbuttons === ShowButtonsWhen.ALWAYS) {
            return;
        }

        // for mode WINDOWS we only need to listen to map and destroy and
        // switch-workspace (we just want to detect whether there are any
        // windows at all on the WS)
        this._wmSignals.push(global.window_manager.connect('switch-workspace',
            Lang.bind(this, this._windowChanged)));
        this._wmSignals.push(global.window_manager.connect('map',
			Lang.bind(this, this._windowChanged)));
        // note: 'destroy' needs a delay for .list_windows() report correctly
        this._wmSignals.push(global.window_manager.connect('destroy',
			Lang.bind(this, function () {
                Mainloop.idle_add(Lang.bind(this, this._windowChanged));
            })));
        if (showbuttons === ShowButtonsWhen.WINDOWS) {
            return;
        }

        // for WINDOWS_VISIBLE we additionally need to listen to min (unmin
        // is covered by map)
        this._wmSignals.push(global.window_manager.connect('minimize',
			Lang.bind(this, this._windowChanged)));

        if (showbuttons === ShowButtonsWhen.WINDOWS_VISIBLE) {
            return;
        }

        // for any_window_maximized we additionaly have to be aware of max/unmax
        // events.
        this._wmSignals.push(global.window_manager.connect('maximize',
			Lang.bind(this, this._windowChanged)));
        this._wmSignals.push(global.window_manager.connect('unmaximize',
			Lang.bind(this, this._windowChanged)));

        if (showbuttons === ShowButtonsWhen.ANY_WINDOW_MAXIMIZED) {
            return;
        }

        // for current_window_maximized we additionally want focus-app
        // NOTE: this fires twice per focus-event, the first with activeWindow
        // being `null` and the second with it being the newly-focused window.
        // (Unless there is no newly-focused window).
        // What a waste!
        this._windowTrackerSignal = Shell.WindowTracker.get_default().connect(
                'notify::focus-app', Lang.bind(this, this._windowChanged));
    },

    _disconnectSignals: function () {
        if (this._windowTrackerSignal) {
            Shell.WindowTracker.get_default().disconnect(this._windowTrackerSignal);
        }
        for (let i = 0; i < this._wmSignals; ++i) {
            global.window_manager.disconnect(this._wmSignals.pop());
        }
        for (let i = 0; i < this._overviewSignals; ++i) {
            Main.overview.disconnect(this._overviewSignals.pop());
        }
        this._wmSignals = [];
        this._overviewSignals = [];
        this._windowTrackerSignal = 0;
    },

    enable: function () {
        //Create boxes for the buttons
        this.rightActor = new St.Bin({ style_class: 'box-bin'});
        this.rightBox = new St.BoxLayout({ style_class: 'button-box' });
        this.leftActor = new St.Bin({ style_class: 'box-bin'});
        this.leftBox = new St.BoxLayout({ style_class: 'button-box' });

        //Add boxes to bins
        this.rightActor.add_actor(this.rightBox);
        this.leftActor.add_actor(this.leftBox);
        //Add button to boxes
        this._display();

        //Load Theme
        this._loadTheme();

        // Connect to window change events
        this._wmSignals = [];
        this._windowTrackerSignal = 0;
        this._connectSignals();

        this._leftContainer = getBox(buttonPosition.left.box);
        this._rightContainer = getBox(buttonPosition.right.box);

        // A delay is needed to let all the other icons load first.
        // Also, show or hide buttons after a delay to let all the windows
        // be properly "there".
        Mainloop.idle_add(Lang.bind(this, function () {
            this._leftContainer.insert_actor(this.leftActor, getPosition(
                    this._leftContainer, buttonPosition.left.position,
                        getNChildren(this._leftContainer)));
            this._rightContainer.insert_actor(this.rightActor, getPosition(
                    this._rightContainer, buttonPosition.right.position,
                        getNChildren(this._rightContainer)));

            // Show or hide buttons
            this._windowChanged();

            return false;
        }));

    },

    disable: function () {
        this._leftContainer.remove_actor(this.leftActor);
        this._rightContainer.remove_actor(this.rightActor);

        /* disconnect all signals */
        this._disconnectSignals();
    }
};

function init(extensionMeta) {
    extensionPath = extensionMeta.path;
    return new WindowButtons();
}
