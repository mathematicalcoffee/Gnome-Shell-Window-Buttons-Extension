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

// Settings
const WA_PINCH = 'pinch';
const WA_ORDER = 'order';
const WA_THEME = 'theme';
const WA_DOGTK = 'dogtk';
const WA_ONLYMAX = 'onlymax';
const WA_HIDEONNOMAX = 'hideonnomax';
const WA_LEFTPOS = 'leftpos';
const WA_RIGHTPOS = 'rightpos';


// Keep enums in sync with GSettings schemas
const PinchType = {
    CUSTOM: 0,
    MUTTER: 1,
    METACITY: 2,
    GNOME_SHELL: 3
};

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

        // theme
        this.addEntry("Name of theme to use:", WA_THEME);

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

        // dogtk
        this.addBoolean("Match Gtk theme if possible", WA_DOGTK);

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
        this.addBoolean("Control only maximized windows", WA_ONLYMAX);

        // hideonnomax
        this.addBoolean("Hide if there are no maximized windows", WA_HIDEONNOMAX);
        // TODO: disable this if WA_ONLYMAX is FALSE

    },

    addEntry: function (text, key) {
        let item = new Gtk.Entry({ hexpand: true });
        item.text = this._settings.get_string(key);
        this._settings.bind(key, item, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.addRow(text, item);
    },

    addBoolean: function (text, key) {
        let item = new Gtk.Switch({active: this._settings.get_boolean(key)});
        this._settings.bind(key, item, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.addRow(text, item);
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
        this.addRow(label, spinButton, true);
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
    },

    addItem: function (widget, col, colspan, rowspan) {
        this.attach(widget, col || 0, this._rownum, colspan || 2, rowspan || 1);
        this._rownum++;
    },
});

function buildPrefsWidget() {
    let widget = new WindowButtonsPrefsWidget();
    widget.show_all();

    return widget;
}
