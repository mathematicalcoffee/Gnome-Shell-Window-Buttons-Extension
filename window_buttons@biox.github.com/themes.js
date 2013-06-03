/** Type of theme.
 * @enum
 * @const */
const ThemeType = {
    /** Metacity theme */
    METACITY: 1,
    /** Unity theme */
    UNITY: 2,
    /** Unknown/invalid/couldn't detect what type of theme it was */
    UNKNOWN: -1
}

/** Generates a window-buttons theme from a unity/metacity one.
 * @param themeDir {string} : unity/metacity theme directory
 * @param outDir {string} : output directory put the window buttons theme in.
 */
function generateStyle(themeDir, outDir) {
    let type;
    [type, themeDir] = getThemeType(themeDir);
    if (type === ThemeType.UNKNKOWN) {
        // TODO
    }
    let theme;
    // TODO: try/catch
    if (type === ThemeType.UNITY) {
        theme = UnityThemeParser.parse(themeDir);

    } else if (type === ThemeType.METACITY) {
    }
    // verifyUnityTheme(path)
    // verifyTheme(themeInfo)
    // createStylesheet(themeInfo)
    // copy files.
}

/** The files required by each theme.
 * @const
 */
const RequiredFiles = {
    METACITY: {directory: 'metacity-1',
               files: /\bmetacity-theme-\d.xml$/},
    UNITY: {directory: 'unity',
            files: ['close.png', 'maximize.png', 'minimize.png']}
};

/** Detects the type of theme in the given directory.
 *
 * As far as I can tell,
 * Unity themes are in a 'unity' subdirectory with images `XYZ_ABC_DEF.ext`, where:
 *
 * - `XYZ` is one of 'close', 'maximize', 'minimize', 'unmaximize';
 * - `ABC` is one of 'focused', 'unfocused'; and
 * - `DEF` is one of 'pressed', 'normal' or 'prelight'.
 *
 * They also *definitely* have the images 'close', 'maximize', 'minimize',
 * 'unmaximize'.
 *
 * At a minimum, we require:
 *
 * - close.png
 * - maximize.png
 * - minimize.png
 *
 * Metacity themes are in a 'metacity-1' subdirectory with a 'metacity-%d.xml'
 * file.
 *
 * @param themeDir {string} : theme directory, e.g. '/usr/share/themes/Adwaita'
 * @returns {[ThemeType, string]} type of theme, METACITY, UNITY or UNKNOWN, and
 * path to the directorty containing the required files (i.e. ends in 'metacity-1'
 * or 'unity').
 */
function getThemeType(themeDir) {
    let fileEnum, info, dir, required_files, valid;

    for (let type in RequiredFiles) {
        if (!RequiredFiles.hasOwnProperty(type)) {
            continue;
        }
        info = RequiredFiles[type];
        // see if we have /usr/share/themes/mytheme/metacity-1 or /usr/share/themes/mytheme
        dir = (GLib.file_test(GLib.build_filenamev([themeDir, info.directory]),
                    GLib.FileTest.EXISTS) ?
                GLib.build_filenamev([themeDir, info.directory]) : themeDir);
        // see if directory exists
        if (!GLib.file_test(dir, GLib.FileTest.EXISTS)) {
            continue;
        }
        // look for files in directory.
        required_files = info.files;
        valid = false;
        for (let i = 0; i < required_files.length; ++i) {
            if (required_files[i] instanceof RegExp) {
                // list all files and see if any match.
                // Note - surely there's got to be a less clunky way to list files?
                fileEnum = Gio.file_new_for_path(dir).enumerate_children('standard::*',
                        Gio.FileQueryInfoFlags.NONE, null);
                valid = false;
                while ((info = fileEnum.next_file(null)) !== null && !valid) {
                    valid = required_files[i].test(info.get_name());
                }
            } else {
                valid = GLib.file_test(GLib.build_filenamev([dir, required_files[i]]),
                            GLib.FileTest.EXISTS);
            }
            // require *all* files to be present.
            if (!valid) {
                break;
            }
        } // check for required files
        if (valid) {
            return [ThemeType[type], dir];
        }
    } // unity or metacity
    return [ThemeType.UNKNOWN, themeDir];
}
