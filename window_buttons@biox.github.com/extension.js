// Copyright (C) 2011 Josiah Messiah (josiah.messiah@gmail.com)
// Licence: GPLv3

const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const GConf = imports.gi.GConf;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const PanelMenu = imports.ui.panelMenu;
const Shell = imports.gi.Shell;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;
let extensionPath = "";

// Settings
const WA_PINCH = Prefs.WA_PINCH;
const WA_ORDER = Prefs.WA_ORDER;
const WA_THEME = Prefs.WA_THEME;
const WA_DO_METACITY = Prefs.WA_DO_METACITY;
const WA_ONLYMAX = Prefs.WA_ONLYMAX;
const WA_HIDEONNOMAX = Prefs.WA_HIDEONNOMAX;
const WA_LEFTPOS = Prefs.WA_LEFTPOS;
const WA_RIGHTPOS = Prefs.WA_RIGHTPOS;

// Keep enums in sync with GSettings schemas
const PinchType = Prefs.PinchType;
const Boxes = Prefs.Boxes;

// Laziness
Meta.MaximizeFlags.BOTH = Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL;

// Laziness
Meta.MaximizeFlags.BOTH = Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL;

const _ORDER_DEFAULT = ":minimize,maximize,close";

function WindowButtons() {
    this._init();
}

WindowButtons.prototype = {
__proto__: PanelMenu.ButtonBox.prototype,

    _init: function () {

        //Load Settings
        this._settings = Convenience.getSettings();

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

        //Connect to setting change events
        this._settings.connect('changed::' + WA_DO_METACITY, Lang.bind(this, this._loadTheme));
        this._settings.connect('changed::' + WA_THEME, Lang.bind(this, this._loadTheme));
        this._settings.connect('changed::' + WA_ORDER, Lang.bind(this, this._display));
        this._settings.connect('changed::' + WA_PINCH, Lang.bind(this, this._display));
        this._settings.connect('changed::' + WA_HIDEONNOMAX, Lang.bind(this, this._windowChanged));

        //Connect to window change events
        Shell.WindowTracker.get_default().connect('notify::focus-app', Lang.bind(this, this._windowChanged));
        global.window_manager.connect('switch-workspace', Lang.bind(this, this._windowChanged));
        global.window_manager.connect('minimize', Lang.bind(this, this._windowChanged));
        global.window_manager.connect('maximize', Lang.bind(this, this._windowChanged));
        global.window_manager.connect('unmaximize', Lang.bind(this, this._windowChanged));
        global.window_manager.connect('map', Lang.bind(this, this._windowChanged));
        global.window_manager.connect('destroy', Lang.bind(this, this._windowChanged));

        // Show or hide buttons
        this._windowChanged();
    },

    _loadTheme: function () {

        let theme,
            oldtheme = this.theme_path || false,
            doMetacity = this._settings.get_boolean(WA_DO_METACITY);

        if (doMetacity) {
            // GTK theme name (e.g. Adwaita - we don't have a style for that yet!)
            // theme = new imports.gi.Gio.Settings({schema: "org.gnome.desktop.interface"}).get_string("gtk-theme");
            // Get Mutter / Metacity theme name
            theme = GConf.Client.get_default().get_string("/apps/metacity/general/theme");
        } else {
            theme = this._settings.get_string(WA_THEME);
        }
        if (theme === oldtheme) {
            return;
        }
        // log('_loadTheme: %s -> %s'.format(oldtheme.toString(), theme));

        // Get CSS of new theme, and check it exists, falling back to 'default'
        let cssPath = GLib.build_filenamev([extensionPath, 'themes', theme,
                                            'style.css']);
        if (!GLib.file_test(cssPath, GLib.FileTest.EXISTS)) {
            cssPath = GLib.build_filenamev([extensionPath,
                                            'themes/default/style.css']);
        }

        let themeContext = St.ThemeContext.get_for_stage(global.stage),
            currentTheme = themeContext.get_theme();
        if (oldtheme) {
            // unload the old style
            currentTheme.unload_stylesheet(oldtheme);
        }
        // load the new style
        currentTheme.load_stylesheet(cssPath);

        // The following forces the new style to reload (it may not be the only
        // way to do it; running the cursor over the buttons works too)
        this.rightActor.grab_key_focus();
        this.leftActor.grab_key_focus();

        this.theme_path = cssPath;
    },

    _display: function () {

        let boxes = [ this.leftBox, this.rightBox ];
        for (let box = 0; box < boxes.length; ++box) {
            let children = boxes[box].get_children();
            for (let i = 0; i < children.length; ++i) {
                children[i].destroy();
            }
        }

        let pinch = this._settings.get_enum(WA_PINCH);
        let order = _ORDER_DEFAULT;

        if (pinch === PinchType.MUTTER) {
            order = GConf.Client.get_default().get_string("/desktop/gnome/shell/windows/button_layout");
        } else if (pinch === PinchType.METACITY) {
            order = GConf.Client.get_default().get_string("/apps/metacity/general/button_layout");
        } else if (pinch === PinchType.GNOME_SHELL) {
            order = new Gio.Settings({ schema: 'org.gnome.shell.overrides' }).get_string('button-layout');
        }
        /* if order is null because keys don't exist, get them from settings (PinchType.CUSTOM) */
        if (pinch === PinchType.CUSTOM || !order || !order.length) {
            order = this._settings.get_string(WA_ORDER);
        }
        /* If still no joy, use a default of :minmize,maximizeclose ... */
        if (!order || !order.length) {
            order = _ORDER_DEFAULT;
        }

        let buttonlist = {  minimize : ['Minimize', this._minimize],
                            maximize : ['Maximize', this._maximize],
                            close    : ['Close', this._close] },
            orders     = order.replace(/ /g, '').split(':'),
            orderLeft  = orders[0].split(','),
            orderRight = orders[1].split(',');

        if (orderRight != "") {
            for (let i = 0; i < orderRight.length; ++i) {
                let button = new St.Button({ style_class: orderRight[i]  + ' window-button', track_hover: true });
                //button.set_tooltip_text(buttonlist[orderRight[i]][0]);
                button.connect('button-press-event', Lang.bind(this, buttonlist[orderRight[i]][1]));
                this.rightBox.add(button);
            }
        }

        if (orderLeft != "") {
            for (let i = 0; i < orderLeft.length; ++i) {
                let button = new St.Button({ style_class: orderLeft[i] + ' window-button' });
                //button.set_tooltip_text(buttonlist[orderLeft[i]][0]);
                button.connect('button-press-event', Lang.bind(this, buttonlist[orderLeft[i]][1]));
                this.leftBox.add(button);
            }
        }

    },


    _windowChanged: function () {
        let hideonnomax = this._settings.get_boolean(WA_HIDEONNOMAX),
            onlymax = this._settings.get_boolean(WA_ONLYMAX);
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
        let activeWindow = global.display.focus_window,
            onlymax = this._settings.get_boolean(WA_ONLYMAX);
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

    _maximize: function () {
        let activeWindow = global.display.focus_window,
            onlymax = this._settings.get_boolean(WA_ONLYMAX);
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
        let activeWindow = global.display.focus_window,
            onlymax = this._settings.get_boolean(WA_ONLYMAX);
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

    /* helper function: convert Boxes.{LEFT,RIGHT,MIDDLE} into
     * Main.panel.{_leftBox, _rightBox, _centerBox}
     */
    _getBox: function (boxEnum) {
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
    },

    /* helper function: convert position.{left,right}.position to a position
     * that insert_actor can handle.
     */
    _getPosition: function (actor, position) {
        if (position < 0) {
            return actor.get_children().length + position + 1;
        } else { // position 1 ("first item on the left") is index 0
            return Math.max(0, position - 1);
        }
    },

    enable: function () {
        let leftbox = this._settings.get_enum(WA_LEFTBOX),
            rightbox = this._settings.get_enum(WA_RIGHTBOX),
            leftpos = this._settings.get_int(WA_LEFTPOS),
            rightpos = this._settings.get_int(WA_RIGHTPOS);

        this._leftContainer = this._getBox(leftbox);
        this._rightContainer = this._getBox(rightbox);

        // A delay is needed to let all the other icons load first.
        Mainloop.idle_add(Lang.bind(this, function () {
            this._leftContainer.insert_actor(this.leftActor,
                    this._getPosition(this._leftContainer, leftpos));
            this._rightContainer.insert_actor(this.rightActor,
                    this._getPosition(this._rightContainer, rightpos));
            return false;
        }));
    },

    disable: function () {
        this._leftContainer.remove_actor(this.leftActor);
        this._rightContainer.remove_actor(this.rightActor);
    }
};

function init(extensionMeta) {
    extensionPath = extensionMeta.path;
    return new WindowButtons();
}
