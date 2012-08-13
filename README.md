Gnome 3 Window Buttons Extension
================================

This is an extension for Gnome 3 which puts minimize, maximize and close buttons in the top panel.

Supports custom button layouts and css theming!

Currently the buttons only control the active window.

Configure with `gnome-shell-extension-prefs` (GNOME 3.4) or by editing `extension.js` (GNOME 3.2).

Installation
------------
(NEW: hopefully, you can install from extensions.gnome.org).

### GNOME 3.4
Either download the .zip file from the [Downloads page](https://github.com/biox/Gnome-Shell-Window-Buttons-Extension/downloads) or checkout the code to the `gnome3.4` branch.

If you have the .zip file, go to Gnome tweak tools --> Shell Extensions --> Install from zip file --> choose the zip file.

If you have the source code, copy the folder to the appropriate place:

	$ cp window_buttons@biox.github.com ~/.local/share/gnome-shell/extensions/

Configure using `gnome-shell-extension-prefs`. No shell restarts required.

### GNOME 3.2
As above (but if you are checking out the code, use the `gnome3.2` branch).

You will also have to add `'window_buttons@biox.github.com'` to the `org.gnome.shell enabled-extensions` key.

**NOTE**: previous versions of this extension allowed you to copy a settings file to `/usr/share` to configure the extension with `dconf-editor`; this has been discontinued because the extension won't pass review on https://extensions.gnome.org if it asks you to do anything requiring root access like that.

You must configure by editing the `extension.js` file. You have to gnome-shell after making changes to `extension.js`.

Configuration
-------------
The following is an explanation of the configuration options available.
For GNOME 3.2 folk trying to edit `extension.js`, there is a bit more explanation in that file.

### Button order
This is the order of the buttons, for example minimize then maximize then close, or close then maximize then minimize.

There are two settings that affect this: `order` and `pinch`.

The `pinch` setting is whether you want to pinch the order of the buttons from Metacity or Gnome shell:

* `PinchType.METACITY` means the order will be taken from the key `/apps/metacity/general/button_layout`,
* `PinchType.GNOME_SHELL` takes the order from `/org/gnome/shell/overrides/button-layout`,
* `PinchType.CUSTOM` means you'll specify the order yourself.

If you choose `PinchType.CUSTOM`, then you have to specify `order`.

`order` is a string (default `':minimize, maximize, close'`) specifying button order.
The available buttons are 'minimize', 'maximize', and 'close', separated by a comma.

The colon `:` splits the buttons into two groups: left and right.
These can be positioned separately. For example, `minimize:maximize, close` will allow you to position the 'minimize' button separately to the 'maximize, close' buttons.

### Themes
What theme to use for the buttons.
There are two settings that control what theme is used: `doMetacity` and `theme`.

If `doMetacity` is set to `true`, window buttons will use whatever theme is in `/apps/metacity/general/theme` (if we have a matching theme). Otherwise, we we will use the `theme` setting to determine which theme to use.

Themes are stored in the `themes` directory of this extension, for example `~/.local/share/gnome-shell/extensions/window_butons@biox.github.com/themes`.
You must set the `theme` to one of these names.
For further details see the 'Themes' section below.

### Controlling maximized windows
By default, Window Buttons will control the *current active* window.

It is possible to set Window Buttons to prioritise controlling maximized windows.
That means that if you press (say) 'minimize', the window that will be minimized will be the *uppermost maximized window*, which is _not necessarily the currently focused window_!

If there are no maximized windows then the buttons will affect the currently focused window.

If you want this (somewhat confusing?) behaviour, then set the setting `onlymax` to `true`.

Furthermore, you can have the buttons only be visible when there is a maximized window to control - if you want this, set `hideonmax` to `true`.

### Positioning the buttons in the panel
Recall you can position the left and right groups of buttons separately (determined by the colon ':' in `order`).

If you use GNOME 3.4, use `gnome-shell-extension-prefs` for the positioning - it's easier.

If you use GNOME 3.2, it's a little more confusing. See the following from `extension.js`.

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

The position of a button group is determined by two factors: what *box* it is in, and what *position* it has *within that box*.

For the box:

* `Boxes.LEFT` means in the left box (usually holds the activities and
  window title buttons)
* `Boxes.MIDDLE` means the centre box (usually holds the date/time, unless
  you have an extension that moves the clock to the right for you).
* `Boxes.RIGHT` means the right box (status area, user menu).

The position is a number representing whereabouts in the box you want the buttons to be.

For example `1` means 'first item from the left', `2` means 'second item from the left' and so on. If you want to anchor from the right, use a negative number: `-1` means 'first item from the right' and so on.

More examples are in `extension.js` (for GNOME 3.2).

Themes
------
The Window Buttons extension is themeable.
Themes live in the `themes`. The name of the directory is the name of the theme.

If you want to make your own theme, you have to add a folder into the `themes` directory.
To start off, copy the `default` theme:

    $ cd window_buttons@biox.github.com/themes
    $ cp -r default my_new_theme 

Then, edit the `style.css` file to style the window buttons. At a bare minimum,
 you need to define styles for `.window-button`, `.minimize`, `.maximize` and `.close`.

The `.window-button` style affects each individual button.
The `.minimize`, `.maximize` and `.close` styles define the styles for each individual button.
You will have to do something like

    background-img: url("path/to/picture")

for each button, and the picture should have the symbol for the button in it (i.e. we do not draw `_`, `X`, etc on the buttons).

See `themes/default/style.css` for more information.

To-do
-----

- Add unfocused window support for better theming
- Modify themes so that we handle drawing the icon and only the background image need be provided?
- Moar themes!

Version map
-----------
For 'version', see 'version' in metadata.json (this is the version of the extension as it appears/is planned for on extensions.gnome.org).

- v1: GNOME 3.2-compatible.
- v2: GNOME 3.4-compatible.
