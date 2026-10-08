"""Bounded, non-extracting validation of a compiler-generated TPZ.

Only server-generated temporary paths and the shared build contract reach this
script. Nested ZIPs are copied to private temporary files, never extracted by name.
"""
import hashlib
import json
import os
import stat
import struct
import sys
import tempfile
import zipfile

budget = 2 * 1024 * 1024 * 1024
consumed = 0


def inventory(archive, flat=False):
    global consumed
    infos = archive.infolist()
    names = [i.filename for i in infos]
    assert len(infos) <= 20000 and len(names) == len(set(names)), "invalid ZIP inventory"
    for info in infos:
        name = info.filename.rstrip('/')
        assert name and not name.startswith('/') and '\\' not in name
        assert all(p not in ('', '.', '..') for p in name.split('/'))
        assert not flat or '/' not in name
        assert not stat.S_ISLNK(info.external_attr >> 16)
        assert not info.flag_bits & 1 and info.compress_type in (0, 8)
        assert info.file_size <= budget and consumed + info.file_size <= budget
        with archive.open(info) as stream:
            while chunk := stream.read(1024 * 1024):
                consumed += len(chunk)
                assert consumed <= budget
    return set(names)


def prefix(archive, name, size=4096):
    assert archive.getinfo(name).file_size > 0
    with archive.open(name) as stream:
        return stream.read(size)


def digest(archive, name):
    h = hashlib.sha256()
    with archive.open(name) as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    return h.digest()


def nested(archive, name, directory, index):
    path = os.path.join(directory, str(index) + '.zip')
    with archive.open(name) as src, open(path, 'xb') as dst:
        while chunk := src.read(1024 * 1024):
            dst.write(chunk)
    return zipfile.ZipFile(path)


def elf(data, architecture, shared=False):
    cls, cpu = {'x86_64': (2, 62), 'arm64': (2, 183), 'arm32': (1, 40), 'x86_32': (1, 3)}[architecture]
    assert len(data) >= 64 and data[:4] == b'\x7fELF' and data[4] == cls and data[5] == 1
    assert struct.unpack_from('<H', data, 18)[0] == cpu
    if shared:
        assert struct.unpack_from('<H', data, 16)[0] == 3


def pe(data, console=False):
    assert len(data) >= 64 and data[:2] == b'MZ'
    offset = struct.unpack_from('<I', data, 60)[0]
    assert offset >= 64 and offset + 94 <= len(data) and data[offset:offset+4] == b'PE\0\0'
    assert struct.unpack_from('<H', data, offset+4)[0] == 0x8664
    assert struct.unpack_from('<H', data, offset+24)[0] == 0x20b
    assert struct.unpack_from('<H', data, offset+92)[0] == (3 if console else 2)


def macho(archive, name, architecture):
    data = prefix(archive, name)
    cpu = {'arm64': 0x100000c, 'x86_64': 0x1000007}
    if architecture != 'universal':
        assert len(data) >= 32 and struct.unpack_from('<III', data)[0:2] == (0xfeedfacf, cpu[architecture])
        assert struct.unpack_from('<I', data, 12)[0] == 2
        return
    assert len(data) >= 48 and struct.unpack_from('>II', data) == (0xcafebabe, 2)
    ranges = []
    seen = set()
    for i in range(2):
        kind, _, offset, size, _ = struct.unpack_from('>IIIII', data, 8+i*20)
        assert kind in cpu.values() and kind not in seen and size >= 32 and offset >= 48
        assert offset+size <= archive.getinfo(name).file_size
        seen.add(kind)
        with archive.open(name) as stream:
            stream.seek(offset)
            header = stream.read(32)
        assert struct.unpack_from('<II', header) == (0xfeedfacf, kind) and struct.unpack_from('<I', header, 12)[0] == 2
        ranges.append((offset, offset+size))
    ranges.sort()
    assert ranges[0][1] <= ranges[1][0]


def main():
    spec = json.load(sys.stdin)
    binary_bytes = 0
    with tempfile.TemporaryDirectory(prefix='mingd-nested-', dir=os.path.dirname(sys.argv[1])) as directory, zipfile.ZipFile(sys.argv[1]) as root:
        names = inventory(root, flat=True)
        assert names == set(spec['required'])
        assert root.getinfo('version.txt').file_size <= 100
        assert root.read('version.txt').decode().strip() == spec['version']
        if spec['dryRun']:
            assert root.getinfo('README.txt').file_size <= 65536
            return 0
        config = spec['config']
        platform = config['platform']
        if platform == 'macos':
            with nested(root, 'macos.zip', directory, 'macos') as mac:
                mac_names = inventory(mac)
                assert 'macos_template.app/Contents/Info.plist' in mac_names
                for kind in config['templateKinds']:
                    name = f"macos_template.app/Contents/MacOS/godot_macos_{kind}.{config['architecture']}"
                    macho(mac, name, config['architecture'])
                    assert mac.getinfo(name).external_attr >> 16 & 0o111
                    binary_bytes += mac.getinfo(name).file_size
            return binary_bytes
        apks = {}
        for index, name in enumerate(spec['templates']):
            if platform == 'linux':
                elf(prefix(root, name), config['architecture'])
                binary_bytes += root.getinfo(name).file_size
            elif platform == 'windows':
                pe(prefix(root, name))
                binary_bytes += root.getinfo(name).file_size
                pe(prefix(root, spec['consoles'][index]), console=True)
            else:
                with nested(root, name, directory, index) as template:
                    template_names = inventory(template, flat=platform == 'web')
                    if platform == 'web':
                        assert {'godot.wasm','godot.js','godot.html','godot.audio.worklet.js','godot.audio.position.worklet.js','godot.service.worker.js','godot.offline.html'} <= template_names
                        assert prefix(template, 'godot.wasm', 8) == b'\0asm\x01\0\0\0'
                        assert template.getinfo('godot.wasm').file_size > 8
                        binary_bytes += template.getinfo('godot.wasm').file_size
                    else:
                        abi = {'arm64':'arm64-v8a','arm32':'armeabi-v7a','x86_64':'x86_64','x86_32':'x86'}[config['architecture']]
                        library = f'lib/{abi}/libgodot_android.so'
                        assert 'AndroidManifest.xml' in template_names and 'classes.dex' in template_names
                        elf(prefix(template, library), config['architecture'], shared=True)
                        elf(prefix(template, f'lib/{abi}/libc++_shared.so'), config['architecture'], shared=True)
                        binary_bytes += template.getinfo(library).file_size
                        apks[config['templateKinds'][index]] = digest(template, library)
        if platform == 'android':
            with nested(root, 'android_source.zip', directory, 'android-source') as source:
                assert {'build.gradle','gradlew','gradle/wrapper/gradle-wrapper.jar'} <= inventory(source)
                for index, kind in enumerate(config['templateKinds']):
                    with nested(source, f'libs/{kind}/godot-lib.template_{kind}.aar', directory, f'aar-{index}') as aar:
                        inventory(aar)
                        library = f'jni/{abi}/libgodot_android.so'
                        elf(prefix(aar, library), config['architecture'], shared=True)
                        assert digest(aar, library) == apks[kind]
        return binary_bytes


try:
    print(json.dumps({'binarySizeBytes': main()}))
except Exception:
    # Never emit attacker-controlled entry names, parser excerpts or file paths.
    sys.stderr.write('Invalid template package\n')
    sys.exit(1)
