/* Window Button GNOME shell extension.
 * Copyright (C) 2011 Josiah Messiah (josiah.messiah@gmail.com)
 * Licence: GPLv3
 *
 * Contributors:
 * - Josiah Messiah <josiah.messiah@gmail.com>
 * - barravi <https://github.com/barravi>
 * - tiper <https://github.com/tiper>
 * - mathematical.coffee <mathematical.coffee@gmail.com>
 *
 * Note: this version (for GNOME 3.2 distributed by extensions.gnome.org) does
 * not use gsettings like the old github version did, because that had to be
 * installed in /usr/share which requires root permissions.
 *
 * Instead, change settings by editting extension.js (In GNOME 3.4 you can
 * use gnome-shell-extension-prefs and gsettings instead of this).
 * 
 * TODO: use global schema if present?
 */

/*** GNOME 3.2: CONFIGURE THE EXTENSION HERE ***/

// [leave this alone] Keep enums in sync with GSettings schemas
const PinchType = {
    CUSTOM: 0,
    MUTTER: 1,
    METACITY: 2,
    GNOME_SHELL: 3
};

// Which box to place things in.
const Boxes = {
    LEFT: 0,
    RIGHT: 1,
    MIDDLE: 2
};

// The order of the window buttons (e.g. :minimize,maximize,close). 
// Colon splits the buttons into two groups, left and right, which can be
// positioned separately.
// If you wish to use this order (rather than the Mutter/Metacity one), you must set
// the 'pinch' variable below to PinchType.CUSTOM.
const order = ':minimize,maximize,close';

// Use custom button order or pinch order settings from mutter/metacity.
// Options: PinchType.MUTTER    (use /desktop/gnome/shell/windows/button_layout)
//          PinchType.METACITY  (use /apps/metacity/general/button_layout)
//          PinchType.GNOME_SHELL(use /org/gnome/shell/overrides/button-layout)
//          PinchType.CUSTOM    (use the 'order' variable above)
const pinch = PinchType.MUTTER;

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

// Prioritise controlling windows which are maximized. Clicking one of the
// window buttons will affect the upper-most maximized window if any, which
// may not necessarily be the focused window. If there are no maximized windows
// it will affect the current focused window.
const onlymax = false;

// Hide the window buttons if there are no maximized windows to control.
// **Only has any effect is the 'onlymax' option above is set to true**
const hideonnomax = false;

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
Meta.MaximizeFlags.BOTH = Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL;

const _ORDER_DEFAULT = order;

/********************
 * Helper functions *
 ********************/
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
        default:
            box = Main.panel._rightBox;
            break;
    }
    return box;
}

/* Convert position.{left,right}.position to a position that insert_actor can
 * handle.
 */
function getPosition(actor, position) {
    if (position < 0) {
        return actor.get_children().length + position + 1;
    } else { // position 1 ("first item on the left") is index 0
        return Math.max(0, position - 1);
    }
}

/* Cycle to the next or previous box (do not wrap around) */
function cycleBox(boxEnum, forward) {
    let nextBox = boxEnum;
    switch(boxEnum) {
        case Boxes.LEFT:
            nextBox = (forward ? Boxes.MIDDLE : Boxes.LEFT);
            break;
        case Boxes.MIDDLE:
            nextBox = (forward ? Boxes.RIGHT : Boxes.LEFT);
            break;
        case Boxes.RIGHT:
            nextBox = (forward ? Boxes.RIGHT : Boxes.MIDDLE);
            break;
    }
    return nextBox;
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
        this._windowTrackerSignal = 0;
    },

    _loadTheme: function () {
        if (doMetacity) {
            // GTK theme name (e.g. Adwaita - we don't have a style for that yet!)
            // theme = new imports.gi.Gio.Settings({schema: "org.gnome.desktop.interface"}).get_string("gtk-theme");
            // Get Mutter / Metacity theme name
            theme = GConf.Client.get_default().get_string("/apps/metacity/general/theme");
        }

        // Get CSS of new theme, and check it exists, falling back to 'default'
        let cssPath = GLib.build_filenamev([extensionPath, 'themes', theme,
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

        if (pinch === PinchType.MUTTER) {
            order = GConf.Client.get_default().get_string("/desktop/gnome/shell/windows/button_layout");
        } else if (pinch === PinchType.METACITY) {
            order = GConf.Client.get_default().get_string("/apps/metacity/general/button_layout");
        } else if (pinch === PinchType.GNOME_SHELL) {
            order = new Gio.Settings({ schema: 'org.gnome.shell.overrides' }).get_string('button-layout');
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
            log("Malformed order (no ':'), will insert at the front");
            orders = ['', orders[0]];
        }

        let orderLeft  = orders[0].split(','),
            orderRight = orders[1].split(',');

        if (orderRight != "") {
            for (let i = 0; i < orderRight.length; ++i) {
                if (!buttonlist[orderRight[i]]) {
                    // skip if the butto name is not right...
                    log('[Window Buttons] warning: \'%s\' is not a valid button'.format(
                                orderRight[i]));
                    continue;
                }
                let button = new St.Button({ style_class: orderRight[i]  + ' window-button', track_hover: true });
                button.set_tooltip_text(buttonlist[orderRight[i]][0]);
                button.connect('button-press-event', Lang.bind(this, buttonlist[orderRight[i]][1]));
                this.rightBox.add(button);
            }
        }

        if (orderLeft != "") {
            for (let i = 0; i < orderLeft.length; ++i) {
                if (!buttonlist[orderLeft[i]]) {
                    log('[Window Buttons] warning: \'%s\' is not a valid button'.format(
                                orderLeft[i]));
                    // skip if the butto name is not right...
                    continue;
                }
                let button = new St.Button({ style_class: orderLeft[i] + ' window-button' });
                button.set_tooltip_text(buttonlist[orderLeft[i]][0]);
                button.connect('button-press-event', Lang.bind(this, buttonlist[orderLeft[i]][1]));
                this.leftBox.add(button);
            }
        }
    },

    _windowChanged: function() {
        if (onlymax && hideonnomax) {
            let activeWindow = global.display.focus_window;
            if (this._upperMax()) {
                this.leftActor.show();
                this.rightActor.show();
            } else {
                this.leftActor.hide();
                this.rightActor.hide();
            }
        }
    },

    // Return the uppermost maximized window from the current workspace, or fasle is there is none
    _upperMax: function () {
        let workspace = global.screen.get_active_workspace();
        let windows = workspace.list_windows();
        let maxwin = false;
        for (let i = windows.length - 1; i >= 0; --i) {
            if (windows[i].get_maximized() && !windows[i].minimized) {
                maxwin = windows[i];
                break;
            }
        }
        return maxwin;
    },

    _minimize: function () {
        let activeWindow = global.display.focus_window;
        if (activeWindow === null || activeWindow.get_title() === "Desktop") {
            // No windows are active, minimize the uppermost window
            let winactors = global.get_window_actors();
            let uppermost = winactors[winactors.length - 1].get_meta_window();
            uppermost.minimize();
        } else {
            // If the active window is maximized, minimize it
            if (activeWindow.get_maximized()) {
                activeWindow.minimize();
            // If the active window is not maximized, minimize the uppermost
            // maximized window if the option to only control maximized windows is set
            } else if (onlymax) {
                let uppermax = this._upperMax();
                if (uppermax) {
                    uppermax.minimize();
                    activeWindow.activate(global.get_current_time());
                } else {
                    // If no maximized windows, minimize the active window
                    activeWindow.minimize();
                }
            // Otherwise minimize the active window
            } else {
                activeWindow.minimize();
            }
        }
    },

    _maximize: function() {
        let activeWindow = global.display.focus_window;
        // window.maximize() did not exist when I started writing this extension!!?!
        if (activeWindow === null || activeWindow.get_title() === "Desktop") {
            // No windows are active, maximize the uppermost window
            let winactors = global.get_window_actors();
            let uppermost = winactors[winactors.length - 1].get_meta_window();
            uppermost.maximize(Meta.MaximizeFlags.BOTH);
            // May as well activate it too...
            uppermost.activate(global.get_current_time());
        } else {
            // If the active window is maximized, unmaximize it
            if (activeWindow.get_maximized()) {
                activeWindow.unmaximize(Meta.MaximizeFlags.BOTH);
            // If the active window is not maximized, unmaximize the uppermost
            // maximized window if the option to only control maximized windows is set
            } else if (onlymax) {
                let uppermax = this._upperMax();
                if (uppermax) {
                    uppermax.unmaximize(Meta.MaximizeFlags.BOTH);
                    activeWindow.activate(global.get_current_time());
                } else {
                    activeWindow.maximize(Meta.MaximizeFlags.BOTH);
                }
            // Otherwise unmaximize the active window
            } else {
                activeWindow.maximize(Meta.MaximizeFlags.BOTH);
            }
        }
    },

    _close: function () {
        let activeWindow = global.display.focus_window;
        if (activeWindow === null || activeWindow.get_title() === "Desktop") {
            // No windows are active, close the uppermost window
            let winactors = global.get_window_actors();
            let uppermost = winactors[winactors.length - 1].get_meta_window();
            uppermost.delete(global.get_current_time());
        } else {
            // If the active window is maximized, close it
            if (activeWindow.get_maximized()) {
                activeWindow.delete(global.get_current_time());
            // If the active window is not maximized, close the uppermost
            // maximized window if the option to only control maximized windows is set
            } else if (onlymax) {
                let uppermax = this._upperMax();
                if (uppermax) {
                    uppermax.delete(global.get_current_time());
                    activeWindow.activate(global.get_current_time());
                } else {
                    // If no maximized windows, close the active window
                    activeWindow.delete(global.get_current_time());
                }
            // Otherwise close the active window
            } else {
                activeWindow.delete(global.get_current_time());
            }
        }
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
        this._windowTrackerSignal = Shell.WindowTracker.get_default().connect(
                'notify::focus-app', Lang.bind(this, this._windowChanged));
        this._wmSignals.push(global.window_manager.connect('switch-workspace',
            Lang.bind(this, this._windowChanged)));
        this._wmSignals.push(global.window_manager.connect('minimize',
			Lang.bind(this, this._windowChanged)));
        this._wmSignals.push(global.window_manager.connect('maximize',
			Lang.bind(this, this._windowChanged)));
        this._wmSignals.push(global.window_manager.connect('unmaximize',
			Lang.bind(this, this._windowChanged)));
        this._wmSignals.push(global.window_manager.connect('map',
			Lang.bind(this, this._windowChanged)));
        this._wmSignals.push(global.window_manager.connect('destroy',
			Lang.bind(this, this._windowChanged)));

        this._leftContainer = getBox(buttonPosition.left.box);
        this._rightContainer = getBox(buttonPosition.right.box);

        // A delay is needed to let all the other icons load first.
        Mainloop.idle_add(Lang.bind(this, function () {
            this._leftContainer.insert_actor(this.leftActor,
                    getPosition(this._leftContainer, buttonPosition.left.position));
            this._rightContainer.insert_actor(this.rightActor,
                    getPosition(this._rightContainer, buttonPosition.right.position));
            return false;
        }));

        // Show or hide buttons
        this._windowChanged();
    },

    disable: function () {
        this._leftContainer.remove_actor(this.leftActor);
        this._rightContainer.remove_actor(this.rightActor);

        /* disconnect all signals */
        this._settings.disconnectAll();
        Shell.WindowTracker.get_default().disconnect(this._windowTrackerSignal);
        for (let i = 0; i < this._wmSignals; ++i) {
            global.window_manager.disconnect(this._wmSignals.pop());
        }
    },
};

function init(extensionMeta) {
    extensionPath = extensionMeta.path;
    return new WindowButtons();
}
