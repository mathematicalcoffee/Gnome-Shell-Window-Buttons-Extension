/** @typedef ButtonInfo
 * buttonInfo[role][state] = path to image.
 */
/**  @typedef ButtonState
 * @const
 * @enum */
const ButtonState = {
};
const ButtonType = {
    maximized
};

/** 
 * @dir: path to the 'themename/unity' directory.
 */
function parse(dir) {
    let theme;
    theme = detectImages(dir);
    if (!verifyTheme(theme)) {
        // TODO: throw error, not enough images present.
    }
    // now we have a struct
}

/** Detects what images a unity theme has, creating a ThemeInfo from it.
 *
 * Note: "unity themes" are not really themes. 
 * They are *not* used for window decoration.
 * Rather, they are used to draw the window buttons in Unity's top panel.
 *
 * If the 'unity' subfolder of the current window theme exists, these images are
 * used to draw window buttons in Unity's top panel. Otherwise, a generic button
 * is drawn.
 *
 * In particular, each button can have one of four *roles*: [TODO link .h]
 *
 * * CLOSE
 * * MAXIMIZE
 * * UNMAXIMIZE
 * * MINIMIZE
 *
 * And one of seven *states*:
 *
 * * NORMAL (a button in the focused window);
 * * PRELIGHT (button in the focused window that is hovered over);
 * * PRESSED (button in the focused window that is being pressed);
 * * DISABLED (?? when a button is shown but that functionality is not available? like non-maximizable windows?);
 * * UNFOCUSED (a button in an unfocused window);
 * * UNFOCUSED_PRELIGHT (a button in an unfocused window that is being hovered over);
 * * UNFOCUSED_PRESSED (a button in an unfocused window that is being pressed).
 *
 * When Unity draws the button for a given type and state, it looks for the
 * file `unity/<role'><state'>.png` in the theme subfolder, where:
 *
 * * `role'` is 'close', 'maximize', 'unmaximize' or 'minimize' (corresponding
 * to the requested role)
 * * `state'` is:
 *  + '' (empty string) for the `NORMAL` state,
 *  + '_focused_prelight' for the `PRELIGHT` state,
 *  + '_focused_pressed' for the `PRESSED` state,
 *  + '_unfocused' for the `DISABLED` and `UNFOCUSED` states,
 *  + '_unfocused_prelight' for the `UNFOCUSED_PRELIGHT` state, and
 *  + '_unfocused_pressed' for the `UNFOCUSED_PRELIGHT` state.
 *
 * The Window Buttons style *must* have a picture/style for the `NORMAL` state for each button type.
 * It may also have a picture/style for the `PRELIGHT` and `PRESSED` states for each button type.
 * Hence we are only interested in:
 *
 * * `<role>.png`
 * * `<role>_focused_prelight.png` (optional)
 * * `<role>_focused_pressed.png` (optional)
 *
 * TODO: max/unmax
 *
 * Hence if a window theme has a 'unity' subfolder we will use that out of
 *  convenience (the images are already generated), but if not we will fall back
 *  to its 'metacity-1' subfolder (and if it has a 'unity' subfolder it should
 *  have a 'metacity-1' one).
 *
 * @param {string} dir: path to the 'unity' subfolder in the theme folder.
 * @returns {ThemeInfo}: TODO.
 * @todo further information on this.
 * BIG TODO: can you have both role_focused_normal.png *and* role.png? which is used?
 * A: Yes
 * @seealso http://bazaar.launchpad.net/~unity-team/unity/trunk/view/3355/unity-shared/PanelStyle.cpp#L197 (source code)
 * @seealso https://bugs.launchpad.net/unity/+bug/740232 (bug report, see #22)
 */
/*
 *
 *
 * 'path' is to 'unity' subfolder
 * UPTO TODO: <role>_normal vs <role> ?
 */
function detectImages(dir) {
    let themeInfo = {};
    themeInfo.name = GLib.filename_display_basename(dir);

    let dir = Gio.file_new_for_path(dir);
    if (!dir.query_exists(null)) {
        error(("Could not parse Unity theme '%s': " +
               "directory does not exist").format(dir);
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
    return themeInfo;
    //return (verifyTheme(themeInfo) ? themeInfo : false);
}
