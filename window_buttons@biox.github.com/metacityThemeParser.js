const cairo = imports.cairo;
const Gdk = imports.gi.Gdk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell; // getting file contents

// mutter/src/ui/theme-parser.js
const THEME_SUBDIR = 'metacity-1';
const THEME_FILENAME_FORMAT = 'metacity-theme-%d.xml';

const CONSTANTS = {};

// Note - metacity uses GMarkupParser but apparently this is not yet introspectable in gnome-shell [0]
// [0]: https://mail.gnome.org/archives/gnome-shell-list/2011-June/msg00051.html
// (and GMarkupParser 'new' is not introspectable)

function myparse(xml) {
    let theme = {
        constants: {},
        draw_ops: {},
        frame_geometries: {},
        buttons: {minimize: {}, maximize: {}, close: {}}
    };
    let outinfo = {};
    let i,
        n,
        els,
        val,
        el;

    // 1. parse constants
    els = xml.constant;
    n = els.length();
    for (i = 0; i < n; ++i) {
        // convert to either number or save as string (assume it's a colour)
        val = parseFloat(el.@value, 10);
        if (isNaN(val)) {
            val = el.@value;
        }
        theme.constants[el.@name.toString()] = val;
    }

    // 2. parse frame geometries (to fill the environment)
    // (just the bits we need to fill the environment)
    els = xml.frame_geometry;
    n = els.length();
    for (i = 0; i < n; ++i) {
        val = {};
        el = els[i];
        let children = el.children();
        // meta_frame_layout_calc_geometry
        for (let j = 0; j < children.length(); ++j) {
            // <distance name=..>, <aspect_ratio name=..>, ...
            let obj = xml_to_obj(children[j]);
            val[obj.name] = obj;
        }
        val.parent = el.@parent.toString();
        val.has_title = el.@has_title.toString() !== 'false';
        theme.frame_geometries[el.@name.toString()] = val;
    }
    // inheritance with frame geometries - loop through everything...
    for (i in theme.frame_geometries) {
        if (!theme.frame_geometries.hasOwnProperty(i)) {
            continue;
        }
        el = theme.frame_geometries[i];
        val = theme.frame_geometries[el.parent];
        while (val) {
            for (let prop in val) {
                if (val.hasOwnProperty(prop) && !el.hasOwnProperty(prop)) {
                    el[prop] = val[prop];
                }
            }
            val = theme.frame_geometries[val.parent];
        }
    }
    // now that inheritance has been sorted out, do a couple more calculations.
    // These help us to fill out the environment.
    for (i in theme.frame_geometries) {
        if (!theme.frame_geometries.hasOwnProperty(i)) {
            continue;
        }
        el = theme.frame_geometries[i];
        let text_height = (el.has_title ?
            // as far as I can tell, this ~matches meta_pango_font_desc_get_text_height ?
            Meta.prefs_get_titlebar_font().get_size() / Pango.SCALE :
            0);
        // borders.visible: meta_frame_layout_get_borders
        el.borders = {top: 0, right: 0, left: 0, bottom: 0}; // top is the only one we care about
        el.borders.top = Math.max(
            el.button_height + el.button_border.top + el.button_border.bottom,
            text_height + el.title_vertical_pad + el.title_border.top + el.title_border.bottom
        );
        el.borders.left = el.left_width;
        el.borders.right = el.right_width;
        el.borders.bottom = el.bottom_height;
    }

    // 3. get the frame style with the buttons of interest. To do this:
    // a) look for window.@type=='normal'.@style_set
    el = xml.window.(@type=='normal').@style_set;
    // b) for that style set, get .@state=='normal'.@focus==yes.@style (fallback: no)
    el = xml.frame_style_set.(@name==el);
    val = el.frame.(@state=='normal').(@focus=='yes');
    if (!val.length()) {
        val = el.frame.(@state=='normal').(@focus=='no');
    }
    val = val.@style;
    // c) get that style.
    el = xml.frame_style.(@name==val);

    // 4. load all the draw ops (by name only)
    els = xml.draw_ops;
    n = els.length();
    for (i = 0; i < n; ++i) {
        el = els[i];
        theme.draw_ops[el.@name.toString()] = el;
    }

    // 4. get the buttons, building up a list of draw ops we need.
    // a. get environment variables
    let env = fill_env(theme.frame_geometries[el.@geometry.toString()]);
    // b. copy over constants into env
    for (i in theme.constants) {
        if (theme.constants.hasOwnProperty(i)) {
            env[i] = theme.constants[i];
        }
    }
    els = el.button;
    n = els.length();
    for (i = 0; i < n; ++i) {
        el = els[i];
        let obj = theme.buttons[el.@function.toString()][el.@state.toString()];
        val = el.@draw_ops.toString();
        if (val) {
            theme.buttons[el.@function.toString()][el.@state.toString()] = theme.draw_ops[val];
        } else {
            theme.buttons[el.@function.toString()][el.@state.toString()] = el.draw_ops;
        }
    }

    let outDir = GLib.dir_make_tmp('XXXXXX');
    // 5. render each button
    for (i in theme.buttons) {
        outinfo[i] = {};
        let states = theme.buttons;
        for (j in states) {
            let outfilename = GLib.build_filenamev([
                    outDir, i + '_' + j + '.svg'
            ]);
            // TODO: need to reduce to an array of draw ops
            create_image_from_draw_op(states[j], env, outfilename);
            outinfo[i][j] = outfilename;
        }
    }
}

function draw_op_to_array(el, draw_ops) {
    let out = [];
    let children = el.children();
    let n = children.length();
    for (let i = 0; i < n; ++i) {
        let child = children[i];
        switch (child.name()) {
            // TODO: these can have x, y, width, height
            case 'include':
                out = out.concat(draw_op_to_array(draw_ops[child.@name.toString()], draw_ops));
                break;
            // TODO: can additionally have xoffset, yoffset, width, height
            case 'tile':

                break;
            default:
                out.push(child);
                break;
        }
    }
    return out;
}
function create_image_from_draw_op(el, env, filename) {
    // make sure all 'include' are replaced with draw ops....
    // they have optional x, y, width, height...
    // <include name="some_other_draw_ops" x= y= ...>
    // <tile name="some_other_draw_ops" tile_width="10" tile_height="10"> ...
    if (env.width == 0) {
        warn('Button width was 0 for some reason; setting to 32');
        env.width = 32;
    }
    if (env.height == 0) {
        warn('Button height was 0 for some reason; setting to 32');
        env.height = 32;
    }
    // UPTO
    // BIG TODO: calculate button width/height dpeending on aspect ratio etc

    let surface = new cairo.SVGSurface(filename, env.width, env.height),
        context = new cairo.Context(surface);

    parse_draw_op_element(el, context, env); // <-- TODO: put constants in here

    surface.flush();
    surface.finish();
    surface.destroy();
    context.destroy();
}

function isnum(x) {
    return typeof x === 'number';
}

/**
 * Parse a `<draw_ops>` tag.
 * @param {XML} el - XML element representing `<draw_ops>` tag.
 * @param {object} themeInfo - object representing the theme.
 * In particular, it should have `themeInfo.constants` with a list of constants
 * defined for the theme.
 *
 *
 * @see `draw_op_draw_with_env` in `mutter/src/ui/theme.c`.
 */
// TODO: variable/constant substitution
// note: we assume the theme has already been through Metacity's parser,
// so we don't need to validate and simply assume all required elements
// are there.
function parse_draw_op_element(el, cr, env) {
    let children = el.children(),
        n = children.length();
    // see theme.c draw-op_draw_with_env
    for (let i = 0; i < n; ++i) {
        let item = children[i],
            name = item.name();
            obj = xml_to_obj(item),
            col = parse_colour(item.@color.toString(), env);
        if (col) {
            Clutter.cairo_set_source_color(cr, col);
        }
        switch (name) {
            case 'line':
                if (obj.width) {
                    cr.setLineWidth(obj.width);
                }

                if (obj.dash_on_length > 0 && obj.dash_off_length > 0) {
                    cr.setDash([obj.dash_on_length, obj.dash_off_length], 0);
                }

                obj.x1 = parse_position_expression(obj.x1, env);
                obj.y1 = parse_position_expression(obj.y1, env);
                obj.x2 = parse_position_expression(obj.x2, env);
                obj.y2 = parse_position_expression(obj.y2, env);

                if (!isnum(obj.x2) && !isnum(obj.y2) && !obj.width) {
                    cr.rectangle(obj.x1, obj.y1, 1, 1);
                    cr.fill();
                } else {
                    if (!isnum(obj.x2)) {
                        obj.x2 = obj.x1;
                    }
                    if (!isnum(obj.y2)) {
                        obj.y2 = obj.y1;
                    }
                    let offset = (obj.width % 2 ? .5 : 0);
                    if ((obj.y1 == obj.y2 || obj.x1 == obj.x2) && obj.width) {
                        if (obj.y1 == obj.y2) {
                            cr.moveTo(obj.x1, obj.y1 + offset);
                            cr.lineTo(obj.x2, obj.y2 + offset);
                        } else {
                            cr.moveTo(obj.x1 + offset, obj.y1);
                            cr.lineTo(obj.x2 + offset, obj.y2);
                        }
                    } else {
                        if (!obj.width) {
                            cr.setLineCap(cairo.LineCap.SQUASH);
                        }

                        cr.moveTo(obj.x1 + .5, obj.y1 + .5);
                        cr.lineTo(obj.x2 + .5, obj.y2 + .5);
                    }
                    cr.stroke();
                }
                break;
            case 'rectangle':
                obj.x = parse_position_expression(obj.x, env);
                obj.y = parse_position_expression(obj.y, env);
                obj.width = parse_size_expression(obj.width, env);
                obj.height = parse_size_expression(obj.height, env);
                // draw
                if (obj.filled) {
                    cr.rectangle(obj.x, obj.y, obj.width, obj.height);
                    cr.fill();
                } else {
                    cr.rectangle(obj.x + .5, obj.y + .5, obj.width, obj.height);
                    cr.stroke();
                }
                break;
            case 'arc':
                obj.x = parse_position_expression(obj.x, env);
                obj.y = parse_position_expression(obj.y, env);
                obj.width = parse_size_expression(obj.width, env);
                obj.height = parse_size_expression(obj.height, env);

                // start at 12 o'clock instead of 3 o'clock
                let start_angle = obj.start_angle * Math.PI / 180 - .5 * Math.PI,
                    end_angle = start_angle + obj.extent_angle * Math.PI / 180,
                    x = obj.x + obj.width / 2 + .5,
                    y = obj.y + obj.height / 2 + .5;
                cr.save();
                cr.translate(x, y);
                cr.scale(obj.width / 2, obj.height / 2);

                if (obj.extent_angle >= 0) {
                    cr.arc(0, 0, 1, start_angle, end_angle);
                } else {
                    cr.arc_negative(0, 0, 1, start_angle, end_angle);
                }
                cr.restore();
                if (obj.filled) {
                    cr.line_to(x, y);
                    cr.fill();
                } else {
                    cr.stroke();
                }
                break;
            case 'clip':
                break;
            case 'tint':
                obj.x = parse_position_expression(obj.x, env);
                obj.y = parse_position_expression(obj.y, env);
                obj.width = parse_size_expression(obj.width, env);
                obj.height = parse_size_expression(obj.height, env);
                obj.alpha = parse_alpha(obj.alpha);
                // FIXME: we do not support alpha gradients.
                if (obj.alpha && obj.alpha.length === 1) {
                    col.alpha = obj.alpha[0];
                }
                Clutter.cairo_set_source_color(cr, col);

                cr.rectangle(obj.x, obj.y, obj.width, obj.height);
                cr.fill();
                break;
            // TODO: from here onwards, compare the wip/cairo branch with others.
            case 'gradient':
                // parse things.
                // parse_gradient_element
                obj.x = parse_position_expression(obj.x, env);
                obj.y = parse_position_expression(obj.y, env);
                obj.width = parse_size_expression(obj.width, env);
                obj.height = parse_size_expression(obj.height, env);
                obj.alpha = parse_alpha(obj.alpha);
                obj.cols = [];
                let cols = item.color; // elements
                // BIG TODO: somehow store 'parsed' things back into the global
                // draw_op object such that we save some re-processing.
                // I think this is why theme-parser.c has all the 'spec' stuff
                // whereas theme.c does the actual drawing.
                let n = cols.length();
                for (let j = 0; j < n; ++j) {
                    obj.cols.push(parse_color(cols[j].@value.toString(), env));
                }



                // create a linear gradient from 0,0 to 1,1
                // meta_gradient_spec_pattern
                let gradient;
                obj.type = obj.type.toLowerCase();
                switch (obj.type) {
                    case 'diagonal':
                        gradient = new cairo.LinearGradient(0, 0, 1, 1);
                        break;
                    case 'vertical':
                        gradient = new cairo.LinearGradient(0, 0, 0, 1);
                        break;
                    case 'horizontal':
                        gradient = new cairo.LinearGradient(0, 0, 1, 0);
                }
                for (let j = 0; j < n; ++j) {
                    col = obj.cols[j];
                    gradient.addColorStopRGBA(j / n,
                            col.red / 255,
                            col.green / 255,
                            col.blue / 255,
                            obj.alpha !== undefined ? (obj.alpha[j] !== undefined ? obj.alpha[j] / 255 : obj.alpha[0] / 255) : 1
                    );
                }

                // meta_gradient_spec_render
                cr.save();
                cr.rectangle(obj.x, obj.y, obj.width, obj.height);
                cr.translate(obj.x, obj.y);
                cr.scale(obj.width, obj.height);
                cr.set_source(cr, gradient);
                cr.fill();
                pattern.destroy();
                cr.restore();
                break;
            case 'image':
                if (!obj.image) {
                    // meta_theme_load_image
                    let parts;
                    if ((parts = obj.filename.match(/^theme:(.+)$/))) {
                        // load icon with parts[1], size 64
                        obj.image = Gtk.IconTheme.get_default().load_icon(
                                parts[1].trim(), 64, 0);
                    } else {
                        // UPTO TODO: need theme's dirname because filename is just a basename
                        obj.image = GdkPixbuf.new_from_file(obj.filename);
                    }
                }
                env.object_width = obj.image.get_width();
                env.object_height = obj.image.get_height();

                obj.x = parse_position_expression(obj.x, env);
                obj.y = parse_position_expression(obj.y, env);
                obj.width = parse_size_expression(obj.width, env);
                obj.height = parse_size_expression(obj.height, env);

                // draw_image
                cr.save();
                cr.rectangle(obj.x, obj.y, obj.width, obj.height);

                if (obj.fill_type && obj.fill_type === 'tile') {
                    Gdk.cairo_set_source_pixbuf(cr, obj.image, 0, 0);
                    cr.getSource().setExtend(cairo.Extend.REPEAT);
                } else { // type 'scale' or undefined
                    cr.translate(obj.x, obj.y);
                    cr.scale(env.object_width / obj.width, env.object_height / obj.height);
                    Gdk.cairo_set_source_pixbuf(cr, obj.image, 0, 0);
                }
                cr.fill();
                cr.restore();

                delete env.object_width;
                delete env.object_height;
                break;
            case 'gtk_arrow':
                // TODO: gtk_render_arrow
                break;
            case 'gtk_box':
                // TODO: gtk_render_frame
                break;
            case 'gtk_vline':
                // TODO: gtk_render_line
                break;
            case 'icon':
                // TODO: draw_op_as_pixbuf
                break;
            case 'title':
                // TODO: do I ever have to do this?
                break;
            case 'include':
                break;
            case 'tile':
                break;
            case default:
                error("Element <%s> is not allowed below <%s>".format(
                            name, 'draw_ops'));
                // TODO: op_list
        }
    }
}

// will *not* parse to a number.
function xml_to_obj(el) {
    let obj = {},
        attr = el.attributes();
    for (let i = 0; i < attr.length(); ++i) {
        let att = attr[i],
            val = att.toString(),
            num = parseFloat(val, 10);
        if (!isNaN(num)) {
            obj[att.name()] = num;
        } else if (val === 'true') {
            obj[att.name()] = true;
        } else if (val === 'false') {
            obj[att.name()] = false;
        } else {
            obj[att.name()] = att.toString().trim();
        }
    }
}

/**
 * Fills environment variables
 * @param {object} the frame geometry object for that frame
 * @returns {object} an object mapping key (variable name) to value.
 *
 * Variables provided are:
 *
 * - width: width of target area
 * - height: height of target area
 * - object_width: natural width of object being drawn
 * - object_height: natural height of object being drawn
 * - left_width: distance from left of frame to client window
 * - right_width: distance from right of frame to client window
 * - top_height: distance from top of frame to client window
 * - bottom_height: distance from bottom of frame to client window
 * - *frame_x_center: X center of the entire frame w.r.t. the piece currently
 *   being drawn
 * - *frame_y_center: Y center of the entire frame w.r.t. the piece currently
 *   being drawn
 * - *mini_icon_width: width of mini icon for window
 * - *mini_icon_height: height of mini icon
 * - *icon_width: width of large icon
 * - *icon_height: height of large icon
 * - *title_width: width of title text
 * - *title_height: height of title text
 *
 * '*' means these properties are OMITTED and we will not parse them. (just set them to 0)
 * (Hopefully we won't get any of those in the button draw_ops).
 *
 *
 * All these are always defined, except `object_width`/`object_height` which
 * only exists for `<image>` right now.
 *
 * @see `fill_env` in `mutter/src/ui/theme.c`
 */
function fill_env(fgeom) {
    env = {};

    // defaults
    env.object_width = -1;
    env.object_height = -1;

    env.frame_x_center = 0;
    env.frame_y_center = 0;

    env.mini_icon_width = 0;
    env.mini_icon_height = 0;
    env.icon_width = 0;
    env.icon_height = 0;

    env.title_width = 0;
    env.title_height = 0;

    // extras:
    env.left_width = fgeom.borders.left || 0;
    env.right_width = fgeom.borders.right || 0;
    env.top_height = fgeom.borders.top || 0;
    env.bottom_height = fgeom.borders.bottom || 0;
}

// BIG TODO: fill_env has logical_region...

/**
 * Parse a position expression, substituting variables in.
 * @param {string} expr - expression to evaluate
 * @param {obj} env - an object with keys being names of variables
 *
 * Sizes must be at least 1x1.
 * @see `meta_parse_size_expression` in `mutter/src/ui/theme.c`
 */
function parse_size_expression(expr, env) {
    let out = null;
    if (typeof out === 'number') {
        return out;
    } else {
        out = pos_eval(expr);
    }
    return Math.max(out, 1);
}

/**
 * Parse a position expression, substituting variables in.
 * @param {string} expr - expression to evaluate
 * @param {obj} env - an object with keys being names of variables
 *
 * @see `meta_parse_position_expression` in `mutter/src/ui/theme.c`
 */
// meta_parse_position_expression (theme.c)
// expr is a string
function parse_position_expression(expr, env) {
    let out = null;
    /*
    // meta_theme_replace_constants: we won't do anything so sophisticated as
    // Meta does.
    let possible_constants = expr.match(/\b[a-zA-Z_]+\b/g);
    if (possible_constants) {
        for (let i = 0; i < possible_constants.length; ++i) {
            let name = possible_constants[i],
                val = env[name];
            if (val) {
                out = out.replace(new Regexp('\\b' + name + '\\b'), val);
            }
        }
    }
    */
    if (typeof out === 'number') {
        return out;
    } else {
        out = pos_eval(expr);
    }
    return out;
}

/**
 * Evaluate a simple expression to be a position variable.
 * @param {string} expr - the input expression
 * @return {null|number} the evaluated expression, or `null` if evaluation
 * failed.
 *
 * Notes: allowed operators are: +, -, *, /, %, ``max``, ``min``.
 * All are given as binary operators, even ``max`` and ``min``,
 *  e.g. "2 ``max`` 5".
 *
 * No negative numbers allowed.
 *
 * If an expression didn't have a ``max`` or ``min`` in it, I can just feed
 * it in to `eval` (since Metacity has already verified these themes,
 * we don't have to worry about unsafe things being evaluated).
 *
 * If it *does* have ``max`` or ``min`` but doesn't have brackets, we evalulate
 * the expression in left-to-right order (agreeing with metacity code).
 *
 * If it has ``max`` or ``min`` and *does* have brackets, we recursively
 * evaluate the first set of innermost brackets (i.e. no brackets inside) until
 * the entire expression has been evaluated (a bit inefficient, I know).
 *
 * @see `pos_eval` in `mutter/src/ui/theme.c`
 */
function pos_eval(expr, env) {
    let maxmins = expr.match(/`(max|min)`/g),
        _out_0_ = null; // call my variable a weird name that would never be
                        // in env
    if (maximins) {
        // eek ! what do we do?

        // first, *very* crude parsing - see if we can simply split the string
        // into bits (delimited by max/min) and evaluate each bit separately..
        bits = expr.split(/`(max|min)`/).map(function (bit) {
            return pos_eval(bit, env);
        });
        if (!bits.filter(function (x) { return x === null;}).length) {
            _out_0_ = bits[0];
            for (let i = 0; i < maxmins.length; ++i) {
                switch (maximins[i]) {
                    case '`max`:
                        _out_0_ = Math.max(_out_0_, bits[i+1]);
                    case '`min`:
                        _out_0_ = Math.min(_out_0_, bits[i+1]);
                }
            }
        } else {
            // complicated - must be max/min nested in brackets or something.
            // keep evaluating sets of brackets recursively ????
            let innermost_brackets = expr.match(/\(([^)]+)\)/);
            while (innermost_brackets) {
                expr = expr.replace(innermost_brackets[0],
                        pos_eval(innermost_brackets[1], env));
                innermost_brackets = expr.match(/\(([^)]+)\)/);
            }
            _out_0_ = pos_eval(expr, env);
        }
    } else {
        // if it doesn't have any `max` and `min`, we can just evaluate it.
        // at this point, all the letters should have been substituted in.
        try {
            with (env) {
                _out_0_ = eval(expr);
            }
        } catch (error) {
            metacityError("Error evaluating expression '%s': %s".format(
                        expr, error.message));
        }
    }
    return _out_0_;
}

/**
 * Parse a string of alphas into an array
 * As far as I can see, 'alpha="..."' can be a colon-separated list of alphas,
 * specifying a horizontal gradient in the alpha channel ???
 */
function parse_alpha (str) {
    if (typeof(str) === 'number') {
        return [Math.round(str * 255)];
    }
    bits = str.split(/:/g);
    return bits.map(function (bit) { return Math.round(parseFloat(bit, 10) * 255); });
}

function MetacityParser() {
    this._init.apply(this, arguments);
}

MetacityParser.prototype = {
    THEME_SUBDIR: 'metacity-1',
    THEME_FILENAME_FORMAT: 'metacity-theme-%d.xml',

    _init: function () {
    },

    // meta_theme_load
    load: function (themeName) {
        let theme = null,
            themeDir = getThemeDir(themeName);
        // step 1: find the latest filename for that theme
        //         first in home dir, XDG_DATA_DIRs, then MUTTER_DATADIR
        //         (loop through version numbers from major to minor)
        // step 2: load the theme
        theme = loadTheme(themeDir, themeName, majorVersion);
        return theme;
    },
    


    // loadTheme, getThemeDir

function loadTheme(themeDir, themeName, majorVersion) {
    let fileName = GLib.build_filenamev([themeDir, themeName]),
        content = Shell.get_file_contents_utf8_sync(fileName),
        xml,
        info = {};

    // remove <?xml version=...?> (developer.mozilla.org/en-US/docs/E4X)
    content = content.replace(/^<\?xml\s+version\s*=\s*(["']).*?\1[^?]*\?>/, '');
    try {
        xml = new XML(content);
    } catch (error) {
        metacityError(error.message);
    }

    info.theme_name = themeName;
    info.theme_file = fileName;
    info.theme_dir = themeDir;
    infor.format_version = 1000 * majorVersion;

}

function metacityError(fileName, message) {
    log("Failed to read theme from file '%s': %s".format(fileName, message));
}
// TODO: `min` and `max`
// TODO: object_width ...
