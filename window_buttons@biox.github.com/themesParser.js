const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

let theme_dirs = GLib.get_system_data_dirs();
theme_dirs.unshift(GLib.build_filenamev([GLib.get_home_dir(), '.themes']));

function error(message) {
    log('[window-buttons] ERROR: ' + message');
}

/* get a list of window themes, by looking in:
 * $HOME/.themes/<themename>
 * /usr/share/themes/<themename>
 *
 * for folders named 'unity' or 'metacity'.
 *
 * In case of duplicates, local ones ($HOME/.themes) beat global ones, and
 * 'unity' beats 'metacity'.
 */
function listThemes() {
    let themes = {metacity: {}, unity: {}};

    for (let i = 0; i < theme_dirs.length; ++i) {
        let dir = Gio.file_new_for_path(theme_dirs[i]);
        if (!dir.query_exists(null)) {
            continue;
        }

        // look within each for a 'unity' subfolder
        let fileEnum = dir.enumerate_children('standard::*',
                Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = fileEnum.next_file(null)) !== null) {
            let themename = info.get_name(),
                themepath = GLib.build_filenamev([dir.get_path(), themename]),
                unitydir = GLib.build_filenamev([themepath, 'unity']),
                metacitydir = GLib.build_filenamev([themepath, 'metacity-1']);
            // prefer unity themes. if we find a unity theme and a metacity one,
            // use the unity one. if there's only a metacity one then use that.
            // TODO: add them *all* for now and filter out later? e.g. we
            // might add a unity theme over its metacity one but the unity one
            // is actually invalid...
            if (GLib.file_test(unitydir, GLib.FileTest.EXISTS) &&
                    !themes.unity[themename]) {
                themes.unity[themename] = themepath;
                /*
                if (themes.metacity[themename]) {
                    delete themes.metacity[themename];
                }
                */
            } else if (GLib.file_test(metacitydir, GLib.FileTest.EXISTS) &&
                    !themes.metacity[themename]) {
                themes.metacity[themename] = themepath;
            }
        }
        fileEnum.close(null);
    }
    return themes;
}

/*
 * Unity themes appear to have images 'XYZ_ABC_DEF.<ext>', where:
 * - XYZ is one of 'close', 'maximize', 'minimize', 'unmaximize'
 * - ABC is one of 'focused', 'unfocused'
 * - DEF is one of 'pressed', 'normal', 'prelight'
 * Not all of these have to be there.
 *
 * They also *definitely* have the images 'close', 'maximize', 'minimize',
 * 'unmaximize'.
 *
 * At a minimum, we require:
 * - close.png
 * - maximize.png
 * - minimize.png
 *
 * We will use (if they are there):
 * - XYZ_focused_DEF.png where 'DEF' is pressed, normal, or prelight.
 *
 * Note - we ignore '*_unfocused_*.png' and any 'unmaximized_*.png'.
 *
 * 'path' is to 'unity' subfolder
 * UPTO TODO: <role>_normal vs <role> ?
 */
function verifyUnityTheme(path) {
    let themeInfo = {};
    themeInfo.name = GLib.filename_display_basename(path);

    let dir = Gio.file_new_for_path(path);
    if (!dir.query_exists(null)) {
        error(("Could not parse Unity theme '%s': " +
               "directory does not exist").format(path);
        return false;
    }

    let fileEnum = dir.enumerate_children('standard::*',
            Gio.FileQueryInfoFlags.NONE, null);
    let info;
    while ((info = fileEnum.next_file(null)) !== null) {
        let fname = info.get_name(), // filename.extension
            basename = fname.replace(/\.[^.]+$/, ''), // remove extension
            parts = basename.split('_'), // split into bits.
            role = parts[0].trim().toLowerCase(),
            focused = parts[1].trim().toLowerCase(),
            state = parts[2].trim().toLowerCase();

        if (!themeInfo[role]) {
            themeInfo[role] = {};
        }

        if (!focused) {
            // just <role>.png
            themeInfo[role].image = fname;
        } else if (focused === 'focused' && state) {
            themeInfo[role][state] = fname;
        }
    }
    fileEnum.close(null);

    return (verifyTheme(themeInfo) ? themeInfo : false);

}

function verifyTheme(themeInfo) {
    // now verify.
    if (themeInfo.close && (themeInfo.close.image || themeInfo.close.normal) &&
            themeInfo.maximize && (themeInfo.maximize.image || themeInfo.maximize.normal) &&
            themeInfo.minimize && (themeInfo.minimize.image || themeInfo.minimize.normal)) {
        return themeInfo;
    }
    error("theme '%s' is missing either a close, maximize, minimize image.".format(
                    themeInfo.name));
    return false;
}

const DEFAULT_BUTTON_WIDTH = 24;
const DEFAULT_BUTTON_HEIGHT = 20;
const ACCEPTABLE_ROLES = ['close', 'minimize', 'maximize'];

function createStylesheet(themeInfo) {
    /* boilerplate CSS, TODO: looks awful in the code */
    let themeText = (
        '.box-bin { }\n\n' +
        '.button-box {\n' +
        '    spacing: 2px;\n' +
        '}\n\n' +
        '.window-button {\n' +
        '    width: %dpx;\n' +
        '    height: %dpx;\n' +
        '}\n\n').format(DEFAULT_BUTTON_WIDTH, DEFAULT_BUTTON_HEIGHT);


    /* TODO: window-button width and height */
    for (let i = 0; i < ACCEPTABLE_ROLES.length; ++i) {
        let role = ACCEPTABLE_ROLES[i];
        themeText += (
            '.%s {\n' +
            '    background-image: url("%s");\n' +
            '}\n\n').format(role, (themeInfo[role].image || themeInfo[role].normal));

        if (themeInfo[role].prelight) {
            themeText += (
                '.%s:hover {\n' +
                '    background-image: url("%s");\n' +
                '}\n\n').format(role, (themeInfo[role].prelight));
        }

        if (themeInfo[role].pressed) {
            themeText += (
                '.%s:active {\n' +
                '    background-image: url("%s");\n' +
                '}\n\n').format(role, (themeInfo[role].pressed));
        }
    }
    return themeText;
    // set a default height of Main.panel.actor.height - some padding?
}

// why don't we just copy all the files locally ???
// or we could have our paths point to /usr/share/themes
function generateUnityStyle(themeInfo, basedir) {
    let stylesheet = createStylesheet(themeInfo);
    GLib.mkdir_with_parents(basedir, 0755);
    GLib.file_set_contents(
        GLib.build_filenamev([basedir, 'stylesheet.css']),
        stylesheet
    );

    // TODO: do we copy the files to our local dir, or do we just have
    // absolute file paths in stylesheet.css?
}

/* path is to the 'metacity-X' folder.
 * http://developer.gnome.org/creating-metacity-themes/2.30/creating-metacity-themes.html
 * http://mcs.une.edu.au/doc/mutter-3.2.2/theme-format.txt
 */
function generateMetacityStyle(stylePath, basedir) {
}

/** The top-level function to call.
 * Generates a style for the specified directories.
 */
function generateStyle(themeDir, outDir) {
}
