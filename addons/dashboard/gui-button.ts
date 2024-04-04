import type { AddonCtxWithAPI } from '../api/api';

export default async function ({ addon, console, intl }: AddonCtxWithAPI) {
    const button = document.createElement('div');
    button.setAttribute('role', 'button');
    button.className = 'charlotteButton';
    button.id = 'charlotteDashboardButton';
    button.innerHTML = `🌠&nbsp;&nbsp;${intl.formatMessage({id: '@dashboard/addons', defaultMessage: 'Addons'})}`;
    button.addEventListener('click', () => {
        addon.app.openFrontend();
    });

    if (!addon.api.appendToSharedSpace(button, 'afterSoundTab')) {
        console.warn('Failed to append to shared space');
    }
    return () => {
        button.remove();
    };
}
