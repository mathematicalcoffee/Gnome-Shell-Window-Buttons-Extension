/**
 * @fileOverview Colours module
 *
 * This is an amalgamation of the colour-related functions in the mutter/
 * metacity source: `ui/theme.c` and `ui/theme-parser.c` mostly.
 *
 * Main entry point:
 *
 * * parse_colour(expression)
 *   Returns: Clutter.Color
 *
 * Main other functions:
 * * gdk_rgba_to_clutter_color
 * * clutter_color_to_gdb_rgba
 *
 * TODO: constants
 *
 */
const Clutter = imports.gi.Clutter;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;

/** 
 * The curent Gtk Style Context
 * @constant
 * @type {Gtk.StyleContext}
 */
let styleContext;
/**
 * Retrieves the GTK style context.
 * @returns {Gtk.StyleContext} the Gtk.StyleContext that was current the *first*
 * time this function was called (it is then cached).
 */
function _getGtkStyleContext() {
    if (!styleContext) {
        let path = new Gtk.WidgetPath();
        path.append_type(Gtk.Widget);
        styleContext = new Gtk.StyleContext();
        styleContext.set_path(path);
    }
    return styleContext;
}

/**
 * Converts a Gdk.RGBA to a Clutter.Color
 * @param {Gdk.RGBA} rgba - a Gdk.RGBA input colour
 * @returns {Clutter.Color} an output Clutter.Color
 */
function gdk_rgba_to_clutter_color(rgba) {
    let col = new Clutter.Color();
    col.red = rgba.red * 255;
    col.green = rgba.green * 255;
    col.blue = rgba.blue * 255;
    col.alpha = rgba.alpha * 255;
    return col;
}

/**
 * Converts a Clutter.Color to a Gdk.RGBA
 * @param {Clutter.Color} col - input Clutter.Color
 * @returns {Gdk.RGBA} `col` as a Gdk.RGBA.
 */
function gdk_rgba_to_clutter_color(col) {
    let rgba = new Gdk.RGBA();
    rgba.red = col.red / 255;
    rgba.blue = col.blue / 255;
    rgba.green = col.green / 255;
    rgba.alpha = col.alpha / 255;
    return rgba;
}

/**
 * Parses a colour expression into a Clutter.Color.
 * @param {string} expr - the input expression
 * @param {object} [constants] - if provided, an object with constant name
 * mapping to colour expression. If one is found, the `constants` object will
 * be *modified* and the colour substituted in place of the expression.
 * @returns {Clutter.Color|false} the expression as a Clutter.Color, or `false`
 * if the parsing failed.
 *
 * The input expression `expr` can be:
 *
 * * hexadecimal colour, rgb or rgba: "#abcdef", "#abcdef33", ...
 * * a colour name in X11's rgb.text: "cyan", "black", ...
 * * a GTK colour name: 'gtk:bg[NORMAL]'
 * * a GTK custom colour: 'gtk:custom(colour_name, fallback_colour)'
 *
 * Note that in the case of GTK colour names, the colour returned will be
 * relevant to the GTK theme at the time of calling the function (so if you
 * call this function then change themes, the returned colour will still be
 * that of the old theme).
 *
 * @see `meta_color_spec_render` in `mutter/src/ui/theme.c`.
 */
function parse_colour(expr, constants) {
    let parts,
        col,
        context = _getGtkStyleContext();

    expr = expr.trim();
    if (!expr) {
        return false;
    }

    // look up constants.
    if (constants.hasOwnProperty(expr)) {
        let col = constants[expr];
        if (col instanceof Clutter.Color) {
            return col;
        } else {
            col = parse_color(constants[expr]);
            constants[expr] = col;
            return col;
        }
    }

    if (parts = expr.match(/^gtk:custom\(([a-zA-Z_-]+), *(.+)\)$/)) {
        let fallback = parse_colour(parts[2], constants) || 'pink',
            colname = parts[0];
        col = context.lookup_color(parts[1], constants);
        if (col[0]) {
            col = col[1];
            // col is a gdk colour
            col = gdk_rgba_to_clutter_color(col);
        } else {
            col = parse_colour(fallback, constants);
        }
    } else if (parts = expr.match(/^gtk:([a-zA-Z]+)\[([^]]+)\]$/)) {
        // gtk colour
        col = get_gtk_color_from_style(parts[2], parts[1], context);
    } else if (parts = expr.match(/^blend\/([^\/]+)\/([^\/]+)\/([0-9.]+)$/)) {
        // blend: blend/bg_color/fg_color/alpha
        let bg = parse_colour(parts[1], constants),
            fg = parse_colour(parts[2], constants),
            alpha = parseFloat(parts[3], 10);
        col = bg.interpolate(fg, alpha);
    } else if (parts = expr.match(/^shade\/([^\/]+)\/([0-9.]+)$/)) {
        // shade: shade/base_color/factor
        col = parse_colour(parts[1], constants);
        let fact = parseFloat(parts[2], 10);
        col = col.shade(fact);
    } else {
        col = new Clutter.Color();
        col.from_string(expr);
    }
    return col;
}

/* ******************************************************** */
/**
 * Gets a gtk colour according to the current style/theme.
 * @param {string|number} state - the state to retrieve: NORMAL, PRELIGHT,
 * INSENSITIVE, ACTIVE, FOCUSED, INCONSISTENT, SELECTED. Either as a string,
 * or as a number (e.g. `Gtk.StateFlags.ACTIVE`).
 * @param {string} component - the component we are interested in. One of 'bg',
 * 'base', 'fg', 'text', 'text_aa', 'mid', 'light' or 'dark'. See notes.
 * @param {Gtk.StyleContext} [_getGtkStyleContext()] styleContext: style context
 * from which to look up colours. If not provided, one will be constructed.
 * @return {Clutter.Color} the requested colour.
 *
 * The components are as follows:
 *
 * * 'bg', 'base': uses the background colour of the theme.
 * * 'fg', 'text': uses the foreground colour of the theme.
 * * 'text_aa': averages the base (background) colour and the foreground colour.
 * * 'mid': averages the light and dark colours.
 * * 'light': the background colour, lightened (factor of 1.3).
 * * 'light': the background colour, darkened (factor of 0.7).
 *
 * @see `meta_set_color_from_style` in `mutter/src/ui/theme.c`
 */
function get_gtk_color_from_style(state, component, styleContext) {
    if (Gtk.StateFlags.hasOwnProperty(state)) {
        state = Gtk.StateFlags[state];
    }
    if (!styleContext) {
        styleContext = _getGtkStyleContext();
    }
    let col, other;
    switch (component) {
        case 'bg':
        case 'base':
            col = styleContext.get_background_color(state);
            col = gdk_rgba_to_clutter_color(col);
            break;
        case 'fg':
        case 'text':
            col = styleContext.get_color(state);
            col = gdk_rgba_to_clutter_color(col);
            break;
        case 'text_aa':
            // average color & base color
            col = styleContext.get_color(state);
            other = get_gtk_color_from_style(state, 'base', styleContext);

            col.red = (col.red + other.red) / 2;
            col.green = (col.green + other.green) / 2;
            col.blue = (col.blue + other.blue) / 2;
            break;
        case 'mid':
            // average light & dark color
            col = get_gtk_light_color_from_style(state, styleContext);
            other = get_gtk_dark_color_from_style(state, styleContext);

            col.red = (col.red + other.red) / 2;
            col.green = (col.green + other.green) / 2;
            col.blue = (col.blue + other.blue) / 2;
            break;
        case 'light':
            col = get_gtk_light_color_from_style(state, styleContext);
            break;
        case 'dark':
            col = get_gtk_dark_color_from_style(state, styleContext);
            break;
    }
    return col;
}
/**
 * Retrieves the 'light' colour of a GTK style.
 * @param {string|number} state  - state to retrieve
 * (`Gtk.StateFlags.NORMAL`, etc)
 * @param {Gtk.StyleContext} styleContext - the GTK style context to get the
 * colours from
 * @returns {Clutter.Color} the light colour of the theme.
 *
 * The light colour of a theme is the background colour, lightened (i.e. shaded
 * with a factor of 0.7).
 *
 * @see `meta_gtk_style_get_light_color` from `mutter/src/ui/theme.c`.
 */
get_gtk_light_color_from_style(state, styleContext) {
    let col = styleContext.get_background_color(state);
    col = gdk_rgba_to_clutter_color(col);
    col = col.lighten();
    return col;
}

/**
 * Retrieves the 'dark' colour of a GTK style.
 * @param {string|number} state  - state to retrieve
 * (`Gtk.StateFlags.NORMAL`, etc)
 * @param {Gtk.StyleContext} styleContext - the GTK style context to get the
 * colours from
 * @returns {Clutter.Color} the dark colour of the theme.
 *
 * The dark colour of a theme is the background colour, darkened (i.e. shaded
 * with a factor of 1.3).
 *
 * @see `meta_gtk_style_get_dark_color` from `mutter/src/ui/theme.c`.
 */
get_gtk_dark_color_from_style(state, styleContext) {
    let col = styleContext.get_background_color(state);
    col = gdk_rgba_to_clutter_color(col);
    col = col.darken();
    return col;
}
