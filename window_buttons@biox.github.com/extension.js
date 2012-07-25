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
    METACITY: 2
};

// The order of the window buttons (e.g. :minimize,maximize,close). Colon represents the shit in the middle.
// If you wish to use this order (rather than the Mutter/Metacity one), you must set
// the 'pinch' variable below to PinchType.CUSTOM.
const order = ':minimize,maximize,close';

// The name of the theme to use
const theme = 'default';

// Use custom button order or the order pinch settings from mutter/metacity.
// Options: PinchType.MUTTER    (use /desktop/gnome/shell/windows/button_layout)
//          PinchType.METACITY  (use /apps/metacity/general/button_layout)
//          PinchType.CUSTOM    (use the 'order' variable above)
const pinch = PinchType.MUTTER;

// Try to use the theme with the same name as the current gtk theme
const dogtk = true;

// How far left should the left-hand buttons be placed. 0 = furthest left.
const leftpos = 0;

// How far right should the right-hand buttons be placed. 0 = furthest right.
const rightpos = 0;

// Prioritise controlling windows which are maximized.
const onlymax = false;

// Hide the window buttons if there are no maximized windows to control. Only works if controling only maximized windows. Only has any effect is the 'onlymax' option is set.
const hideonnomax = false;

/*********** CODE. LEAVE THE FOLLOWING **************/
const Lang = imports.lang;
const St = imports.gi.St;
const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const GConf = imports.gi.GConf;
const PanelMenu = imports.ui.panelMenu;
const Shell = imports.gi.Shell;

let extensionPath = "";

function WindowButtons() {
    this._init();
}

WindowButtons.prototype = {
__proto__: PanelMenu.ButtonBox.prototype,

    _init: function() {

        //Load Settings
        //this._settings = new Gio.Settings({ schema: WA_SETTINGS_SCHEMA });

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
        /*
        this._settings.connect('changed::'+WA_DOGTK, Lang.bind(this, this._loadTheme));
        this._settings.connect('changed::'+WA_THEME, Lang.bind(this, this._loadTheme));
        this._settings.connect('changed::'+WA_ORDER, Lang.bind(this, this._display));
        this._settings.connect('changed::'+WA_PINCH, Lang.bind(this, this._display));
        this._settings.connect('changed::'+WA_HIDEONNOMAX, Lang.bind(this, this._windowChanged));
        */

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

    _loadTheme: function() {

        let oldtheme = theme;

        //dogtk = this._settings.get_boolean(WA_DOGTK);

        if (dogtk) {
            // Get GTK theme name
            //theme = new imports.gi.Gio.Settings({schema: "org.gnome.desktop.interface"}).get_string("gtk-theme")
            // Get Mutter / Metacity theme name
            theme = GConf.Client.get_default().get_string("/apps/metacity/general/theme");
        }/* else {
            theme = this._settings.get_string(WA_THEME);
        }*/

        // Get CSS of new theme, and check it exists, falling back to 'default'
        let cssPath = extensionPath + '/themes/' + theme + '/style.css';
        let cssFile = Gio.file_new_for_path(cssPath);
        if (!cssFile.query_exists(null)) { cssPath = extensionPath + '/themes/default/style.css' }

        // Old method, requires restart really
        St.ThemeContext.get_for_stage(global.stage).get_theme().load_stylesheet(cssPath);

        // Reload shell theme with new style - only seems to work well with custom shell themes
        //~ let themeContext = St.ThemeContext.get_for_stage(global.stage);
        //~ let currentTheme = themeContext.get_theme();
        //~ let newTheme = new St.Theme ({application_stylesheet: Main._cssStylesheet});
        //~ if (currentTheme) {
            //~ let customStylesheets = currentTheme.get_custom_stylesheets();
            //~ for (let i = 0; i < customStylesheets.length; i++) {
                //~ if (customStylesheets[i] != extensionPath + '/themes/' + oldtheme + '/style.css') {
                    //~ newTheme.load_stylesheet(customStylesheets[i]);
                //~ }
            //~ }
        //~ }
        //~ newTheme.load_stylesheet(cssPath);
        //~ themeContext.set_theme(newTheme);

        // Naughty bit to make "default" theme look better
            //~ for (i in this.leftBox.get_children()) {
                //~ if (theme == "default") {this.leftBox.get_children()[i].add_style_class_name("panel-button"); } 
                //~ else { this.leftBox.get_children()[i].remove_style_class_name("panel-button"); }
            //~ }
            //~ for (i in this.rightBox.get_children()) {
                //~ if (theme == "default") {this.rightBox.get_children()[i].add_style_class_name("panel-button"); } 
                //~ else { this.rightBox.get_children()[i].remove_style_class_name("panel-button"); }
            //~ }
    },

    _display: function() {

        let boxes = [ this.leftBox, this.rightBox ];
        for (box in boxes) {
            let children = boxes[box].get_children()
            for ( let i=0; i<children.length; ++i ) {
                    children[i].destroy();
            }
        }

        //pinch = this._settings.get_enum(WA_PINCH);

        if (pinch == 0) {
            // use 'order' variable.
            //order = this._settings.get_string(WA_ORDER);
        } else if (pinch == 1) {
            order = GConf.Client.get_default().get_string("/desktop/gnome/shell/windows/button_layout");
        } else if (pinch == 2) {
            order = GConf.Client.get_default().get_string("/apps/metacity/general/button_layout");
        }

        let buttonlist = {  minimize : ['Minimize', this._minimize], 
                            maximize : ['Maximize', this._maximize], 
                            close    : ['Close', this._close] } ;

        let orders = order.split(':')
        let orderLeft  = orders[0].split(',')
        let orderRight = orders[1].split(',')

        if (orderRight != "") {
            for ( let i=0; i<orderRight.length; ++i ) {
                let button = new St.Button({ style_class: orderRight[i]  + ' window-button' , track_hover: true } ); 
                //button.set_tooltip_text( buttonlist[orderRight[i]][0] );
                button.connect('button-press-event', Lang.bind(this, buttonlist[orderRight[i]][1]));
                this.rightBox.add_actor(button);
            }
        }

        if (orderLeft != "") {
            for ( let i=0; i<orderLeft.length; ++i ) {
                let button = new St.Button({ style_class: orderLeft[i] + ' window-button' } ); 
                //button.set_tooltip_text( buttonlist[orderLeft[i]][0] );
                button.connect('button-press-event', Lang.bind(this, buttonlist[orderLeft[i]][1]));
                this.leftBox.add(button);
            }
        }

    },


    _windowChanged: function() {
        //hideonnomax = this._settings.get_boolean(WA_HIDEONNOMAX);
        if (onlymax && hideonnomax) {
            let activeWindow = global.display.focus_window
            if (this._upperMax()) {
                this.leftActor.show()
                this.rightActor.show()
            } else {
                this.leftActor.hide()
                this.rightActor.hide()
            }
        }
    },

    // Return the uppermost maximized window from the current workspace, or fasle is there is none
    _upperMax: function() {
        let workspace = global.screen.get_active_workspace();
        let windows = workspace.list_windows();
        let maxwin = false;
        for ( let i=windows.length-1; i>=0; --i ) {
            if (windows[i].get_maximized() && !windows[i].minimized) {
                maxwin = windows[i]
                break;
            }
        }
        return maxwin;
    },

    _minimize: function() {
        let activeWindow = global.display.focus_window
        //onlymax = this._settings.get_boolean(WA_ONLYMAX);
        if (activeWindow == null || activeWindow.get_title() == "Desktop") {
            // No windows are active, minimize the uppermost window
            let winactors = global.get_window_actors()
            let uppermost = winactors[winactors.length-1].get_meta_window()
            uppermost.minimize()
        } else {
            // If the active window is maximized, minimize it
            if (activeWindow.get_maximized()){
                activeWindow.minimize();
            // If the active window is not maximized, minimize the uppermost 
            // maximized window if the option to only control maximized windows is set
            } else if (onlymax) {
                let uppermax = this._upperMax()
                if ( uppermax ) {
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
        let activeWindow = global.display.focus_window
        //onlymax = this._settings.get_boolean(WA_ONLYMAX);
        // window.maximize() did not exist when I started writing this extension!!?!
        if (activeWindow == null || activeWindow.get_title() == "Desktop") {
            // No windows are active, maximize the uppermost window
            let winactors = global.get_window_actors()
            let uppermost = winactors[winactors.length-1].get_meta_window()
            uppermost.maximize(3)
            // May as well activate it too...
            uppermost.activate(global.get_current_time())
        } else {
            // If the active window is maximized, unmaximize it
            if (activeWindow.get_maximized()){
                activeWindow.unmaximize(3);
            // If the active window is not maximized, unmaximize the uppermost 
            // maximized window if the option to only control maximized windows is set
            } else if (onlymax) {
                let uppermax = this._upperMax()
                if ( uppermax ) {
                    uppermax.unmaximize(3);
                    activeWindow.activate(global.get_current_time());
                } else {
                    activeWindow.maximize(3);
                }
            // Otherwise unmaximize the active window
            } else {
                activeWindow.maximize(3);
            }
        }
    },

    _close: function() {
        let activeWindow = global.display.focus_window
        //onlymax = this._settings.get_boolean(WA_ONLYMAX);
        if (activeWindow == null || activeWindow.get_title() == "Desktop") {
            // No windows are active, close the uppermost window
            let winactors = global.get_window_actors()
            let uppermost = winactors[winactors.length-1].get_meta_window()
            uppermost.delete(global.get_current_time())
        } else {
            // If the active window is maximized, close it
            if (activeWindow.get_maximized()){
                activeWindow.delete(global.get_current_time());
            // If the active window is not maximized, close the uppermost 
            // maximized window if the option to only control maximized windows is set
            } else if (onlymax) {
                let uppermax = this._upperMax()
                if ( uppermax ) {
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


    enable: function() {
        let children = Main.panel._rightBox.get_children();
        Main.panel._rightBox.add_actor(this.rightActor, children.length);
        Main.panel._leftBox.add_actor(this.leftActor, 0);
    },

    disable: function() {
        Main.panel._rightBox.remove_actor(this.leftActor);
        Main.panel._rightBox.remove_actor(this.rightActor);
    }
};

function init(extensionMeta) {
    extensionPath = extensionMeta.path;
    return new WindowButtons();
}
