import { isPaused, setPaused, onPauseChanged, setup } from './module';
import playIcon from './play.svg';
import pauseIcon from './pause.svg';

export default async function ({ addon, console, intl }) {
    setup(addon);

    const img = document.createElement('img');
    img.className = 'pause-btn';
    img.draggable = false;
    img.title = intl.formatMessage({id: '@pause/pause', defaultMessage: 'pause'});

    const setSrc = () => {
        img.src = isPaused() ? playIcon : pauseIcon;
        img.title = isPaused() ?
            intl.formatMessage({id: '@pause/play', defaultMessage: 'play'})
            : intl.formatMessage({id: '@pause/pause', defaultMessage: 'pause'});
    };
    img.addEventListener('click', () => setPaused(!isPaused()));
    setSrc();
    onPauseChanged(setSrc);

    document.addEventListener(
        'keydown',
        function (e) {
            // E.code is not enough because that corresponds to physical keys, ignoring keyboard layouts.
            // E.key is not enough because on macOS, option+x types ≈ and shift+option+x types ˛
            // E.keyCode is always 88 when pressing x regardless of modifier keys, so that's how we'll handle macOS.
            // Because keyCode is deprecated we'll still check e.key in case keyCode is not as reliable as we think it is
            if (e.altKey && (e.key.toLowerCase() === 'x' || e.keyCode === 88) && !addon.self.disabled) {
                e.preventDefault();
                e.stopImmediatePropagation();
                setPaused(!isPaused());
            }
        },
        { capture: true }
    );

    (async () => {
        const skipRedux = addon.api.getPlatform() === 'cc';
        while (true) {
            if (skipRedux) {
                await addon.api.waitForElement("[class^='green-flag']", {
                    markAsSeen: true
                });
            } else {
                await addon.api.waitForElement("[class^='green-flag']", {
                    markAsSeen: true,
                    reduxEvents: ['scratch-gui/mode/SET_PLAYER', 'fontsLoaded/SET_FONTS_LOADED', 'scratch-gui/locales/SELECT_LOCALE'],
                });
            }
            addon.api.appendToSharedSpace(img, 'afterGreenFlag', 0);
        }
    })();
}
