/** Credit:
 *  based off prefs.js from the gnome shell extensions repository at
 *  git.gnome.org/browse/gnome-shell-extensions
 */

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

const ExtensionUtils = imports.misc.extensionUtils;
const Params = imports.misc.params;

const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
let extensionPath = Me.path;

// Settings
const WA_PINCH = 'pinch';
const WA_ORDER = 'order';
const WA_THEME = 'theme';
const WA_DO_METACITY = 'do-metacity';
const WA_ONLYMAX = 'onlymax';
const WA_HIDEONNOMAX = 'hideonnomax';
const WA_LEFTBOX = 'box-left';
const WA_LEFTPOS = 'position-left';
const WA_RIGHTBOX = 'box-right';
const WA_RIGHTPOS = 'position-right';


// Keep enums in sync with GSettings schemas
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
// EXAMPLES:
// Put as the right-most item in the status bar:
//     box: Boxes.RIGHT,
//     position: -1
// Put as the left-most item in the status bar:
//     box: Boxes.RIGHT,
//     position: 1
// Put right after the title-bar:
//     box: Boxes.LEFT,
//     position: -1
// Put in before the title-bar (between 'Activities' and the title bar):
//     box: Boxes.LEFT,
//     position: 2

function init() {
}

const WindowButtonsPrefsWidget = new GObject.Class({
    Name: 'WindowButtons.Prefs.Widget',
    GTypeName: 'WindowButtonsPrefsWidget',
    Extends: Gtk.Grid,

    _init: function(params) {
        this.parent(params);
        this.margin = this.row_spacing = this.column_spacing = 10;
        this._rownum = 0;
        this._settings = Convenience.getSettings();

        // themes: look in extensionPath/themes
        // TODO: disable this if doMetacity
        let info,
            item = new Gtk.ComboBoxText(),
            themes_dir = Gio.file_new_for_path(
                GLib.build_filenamev([extensionPath, 'themes'])
            ),
            fileEnum = themes_dir.enumerate_children('standard::*',
                    Gio.FileQueryInfoFlags.NONE, null);

        while ((info = fileEnum.next_file(null)) !== null) {
            let theme = info.get_name();
            if (GLib.file_test(GLib.build_filenamev([themes_dir.get_path(),
                    theme, 'style.css']), GLib.FileTest.EXISTS)) {
                item.append(theme, theme);
            }
        }
        fileEnum.close(null);

        item.connect('changed', Lang.bind(this, function(combo) {
            let value = combo.get_active_id();
            if (value !== undefined && this._settings.get_string(WA_THEME) !== value) {
                this._settings.set_string(WA_THEME, value)
            }
        }));
        item.set_active_id(this._settings.get_string(WA_THEME) || 'default');
        this.addRow("Which theme to use:", item);
        this._themeCombo = item;

        // doMetacity
        this._doMetacity = this.addBoolean("Match Metacity theme if possible\n" +
            " (/apps/metacity/general/theme, OVERRIDES above theme)",
            WA_DO_METACITY);
        this._doMetacity.connect('notify::active', Lang.bind(this, function () {
            this._themeCombo.set_sensitive(!this._doMetacity.active);
        }));
        this._themeCombo.set_sensitive(!this._doMetacity.active);

        // order
        this.addEntry("Button order:\n(allowed: {'minimize', 'maximize', 'close', ':'})", WA_ORDER);

        // pinch
        let item = new Gtk.ComboBoxText();
        for (let type in PinchType) {
            if (PinchType.hasOwnProperty(type)) {
                let label = type[0].toUpperCase() + type.substring(1).toLowerCase();
                label = label.replace(/_/g, '-');
                item.insert(-1, PinchType[type].toString(), label);
            }
        }
        item.set_active_id(this._settings.get_enum(WA_PINCH).toString());
        item.connect('changed', Lang.bind(this, function(combo) {
            let value = parseInt(combo.get_active_id());
            if (value !== undefined && this._settings.get_enum(WA_PINCH) !== value) {
                this._settings.set_enum(WA_PINCH, value)
            }
        }));
        this.addRow("Which button order to use:", item);

        // NOTE: these are not used anywhere (yet), although they are in the schema.
        /*
        // leftpos
        this.addSpin("How far the left-hand buttons are placed\n(0 = furthest left)",
            WA_LEFTPOS,
            {lower: 0,
             upper: 10,
             step_increment: 1
            },
            {digits: 0,
             snap_to_ticks: true,
             numeric: true
            });

        // rightpos
        this.addSpin("How far the right-hand buttons are placed\n(0 = furthest right)",
            WA_LEFTPOS,
            {lower: 0,
             upper: 10,
             step_increment: 1
            },
            {digits: 0,
             snap_to_ticks: true,
             numeric: true
            });
        */
        
        // onlymax
        this._onlymax = this.addBoolean("Control only maximized windows",
            WA_ONLYMAX);

        // hideonnomax
        this._hideonmax = this.addBoolean("Hide if there are no maximized windows",
            WA_HIDEONNOMAX);
        // enable with onlymax
        this._onlymax.connect('notify::active', Lang.bind(this, function () {
            this._hideonmax.set_sensitive(this._onlymax.active);
        }));
        this._hideonmax.set_sensitive(this._onlymax.active);

    },

    addEntry: function (text, key) {
        let item = new Gtk.Entry({ hexpand: true });
        item.text = this._settings.get_string(key);
        this._settings.bind(key, item, 'text', Gio.SettingsBindFlags.DEFAULT);
        return this.addRow(text, item);
    },

    addBoolean: function (text, key) {
        let item = new Gtk.Switch({active: this._settings.get_boolean(key)});
        this._settings.bind(key, item, 'active', Gio.SettingsBindFlags.DEFAULT);
        return this.addRow(text, item);
    },

    addSpin: function(label, key, adjustmentProperties, spinProperties) {
        adjustmentProperties = Params.parse(adjustmentProperties,
            { lower: 0, upper: 100, step_increment: 100 });
        let adjustment = new Gtk.Adjustment(adjustmentProperties);
        spinProperties = Params.parse(spinProperties,
            { adjustment: adjustment, numeric: true, snap_to_ticks: true },
            true
        );
        let spinButton = new Gtk.SpinButton(spinProperties);

        spinButton.set_value(this._settings.get_int(key));
        spinButton.connect('value-changed', Lang.bind(this, function (spin) {
            let value = spin.get_value_as_int();
            if (this._settings.get_int(key) !== value) {
                this._settings.set_int(key, value);
            }
        }));
        return this.addRow(label, spinButton, true);
    },
    
    addRow: function (text, widget, wrap) {
        let label = new Gtk.Label({
            label: text,
            hexpand: true,
            halign: Gtk.Align.START
        });
        label.set_line_wrap(wrap || false);
        this.attach(label, 0, this._rownum, 1, 1); // col, row, colspan, rowspan
        this.attach(widget, 1, this._rownum, 1, 1);
        this._rownum++;
        return widget;
    },

    addItem: function (widget, col, colspan, rowspan) {
        this.attach(widget, col || 0, this._rownum, colspan || 2, rowspan || 1);
        this._rownum++;
        return widget;
    },
});

function buildPrefsWidget() {
    let widget = new WindowButtonsPrefsWidget();
    widget.show_all();

    return widget;
}
