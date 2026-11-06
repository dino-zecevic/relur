import { BRAND } from '@shared/brand';
import { describe, expect, it } from 'vitest';
import { updateWay, type WhereItRuns } from './install';

const mac: WhereItRuns = {
  platform: 'darwin',
  arch: 'arm64',
  translated: false,
  packaged: true,
  exePath: `/Applications/${BRAND.displayName}.app/Contents/MacOS/${BRAND.displayName}`,
  appImage: undefined,
  writable: () => true,
};

describe('updateWay', () => {
  it('replaces a Mac app where it is, with the zip for its architecture', () => {
    expect(updateWay(mac)).toEqual({
      kind: 'self',
      app: 'app',
      target: `/Applications/${BRAND.displayName}.app`,
      asset: `${BRAND.displayName}-mac-arm64.zip`,
    });
    expect(updateWay({ ...mac, arch: 'x64' })).toMatchObject({
      asset: `${BRAND.displayName}-mac-x64.zip`,
    });
    // Under Rosetta: Apple Silicon, as install.sh picks.
    expect(updateWay({ ...mac, arch: 'x64', translated: true })).toMatchObject({
      asset: `${BRAND.displayName}-mac-arm64.zip`,
    });
  });

  it("says why when it can't replace itself", () => {
    expect(updateWay({ ...mac, writable: () => false })).toEqual({
      kind: 'terminal',
      why: `${BRAND.displayName} can't replace itself in /Applications, a folder you can't write to.`,
    });
    expect(
      updateWay({
        ...mac,
        exePath: `/private/var/folders/x/AppTranslocation/1/d/${BRAND.displayName}.app/Contents/MacOS/${BRAND.displayName}`,
      }),
    ).toMatchObject({ kind: 'terminal', why: expect.stringMatching(/temporary copy/) });
    expect(
      updateWay({
        ...mac,
        exePath: `/Volumes/${BRAND.displayName}/${BRAND.displayName}.app/Contents/MacOS/${BRAND.displayName}`,
      }),
    ).toMatchObject({ kind: 'terminal', why: expect.stringMatching(/disk image/) });
  });

  it('replaces an AppImage; a .deb keeps the apt command; a build from source cannot update', () => {
    const linux: WhereItRuns = {
      ...mac,
      platform: 'linux',
      arch: 'x64',
      exePath: `/tmp/.mount_x/${BRAND.linuxExecutable}`,
      appImage: '/home/u/Applications/App.AppImage',
    };
    expect(updateWay(linux)).toEqual({
      kind: 'self',
      app: 'appimage',
      target: '/home/u/Applications/App.AppImage',
      asset: `${BRAND.displayName}-linux-x64.AppImage`,
    });
    expect(updateWay({ ...linux, appImage: undefined })).toEqual({ kind: 'deb' });
    expect(updateWay({ ...linux, packaged: false })).toEqual({ kind: 'source' });
    expect(updateWay({ ...mac, packaged: false })).toEqual({ kind: 'source' });
  });

  it('replaces the test target instead, packaged or not', () => {
    expect(updateWay({ ...mac, packaged: false, testTarget: '/tmp/t/App.app' })).toMatchObject({
      kind: 'self',
      target: '/tmp/t/App.app',
    });
  });
});
