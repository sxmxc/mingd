"""Read verified official TPZ entries without extracting or executing binaries.

The third CLI argument is the reference target plan from @mingd/build-config.
Nested archives are spooled to bounded temporary files to avoid holding APKs,
app bundles and their decompressed binaries together in memory.
"""
import contextlib
import json
import shutil
import struct
import sys
import tempfile
import zipfile

LIMIT = 512 * 1024 * 1024
ANDROID_ABIS = {
    "arm64": ("arm64-v8a", 2, 183), "arm32": ("armeabi-v7a", 1, 40),
    "x86_64": ("x86_64", 2, 62), "x86_32": ("x86", 1, 3),
}
MACOS_CPUS = {0x0100000C: "arm64", 0x01000007: "x86_64"}


def entry(z, name):
    matches = [item for item in z.infolist() if item.filename == name]
    if len(matches) != 1 or not 0 < matches[0].file_size <= LIMIT:
        raise ValueError("Missing, duplicate or oversized template entry: " + name)
    return matches[0]


def header(z, item, length):
    with z.open(item) as stream:
        return stream.read(length)


@contextlib.contextmanager
def nested_archive(z, name):
    item = entry(z, name)
    with tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024) as temporary:
        with z.open(item) as stream:
            shutil.copyfileobj(stream, temporary, length=1024 * 1024)
        if temporary.tell() != item.file_size:
            raise ValueError("Incomplete nested archive: " + name)
        temporary.seek(0)
        with zipfile.ZipFile(temporary) as nested:
            yield nested


def android_size(z, architecture):
    abi, elf_class, machine = ANDROID_ABIS[architecture]
    item = entry(z, f"lib/{abi}/libgodot_android.so")
    data = header(z, item, 64)
    if (len(data) < 64 or data[:4] != b"\x7fELF" or data[4:6] != bytes((elf_class, 1))
            or struct.unpack_from("<H", data, 16)[0] != 3
            or struct.unpack_from("<H", data, 18)[0] != machine):
        raise ValueError("Expected official Android ELF shared library for " + architecture)
    return item.file_size


def macos_sizes(z, kind):
    item = entry(z, f"macos_template.app/Contents/MacOS/godot_macos_{kind}.universal")
    data = header(z, item, 72)
    if len(data) < 8:
        raise ValueError("Truncated official Mach-O universal header")
    magic, count = struct.unpack_from(">II", data)
    if magic not in (0xCAFEBABE, 0xCAFEBABF) or count != 2:
        raise ValueError("Expected official universal ARM64/x86_64 Mach-O executable")
    stride = 32 if magic == 0xCAFEBABF else 20
    table_end = 8 + count * stride
    if len(data) < table_end:
        raise ValueError("Truncated official Mach-O slice table")
    sizes = {"universal": item.file_size}
    slices = []
    for index in range(count):
        position = 8 + index * stride
        cpu = struct.unpack_from(">I", data, position)[0]
        offset, size = struct.unpack_from(">QQ" if stride == 32 else ">II", data, position + 8)
        architecture = MACOS_CPUS.get(cpu)
        if (architecture is None or architecture in sizes or offset < table_end or size < 32
                or offset + size > item.file_size):
            raise ValueError("Invalid official Mach-O slice identity or bounds")
        sizes[architecture] = size
        slices.append((offset, size, cpu))
    slices.sort()
    if slices[0][0] + slices[0][1] > slices[1][0]:
        raise ValueError("Overlapping official Mach-O slices")
    with z.open(item) as stream:
        for offset, size, cpu in slices:
            stream.seek(offset)
            thin = stream.read(32)
            if (len(thin) != 32 or struct.unpack_from("<I", thin)[0] != 0xFEEDFACF
                    or struct.unpack_from("<I", thin, 4)[0] != cpu
                    or struct.unpack_from("<I", thin, 12)[0] != 2):
                raise ValueError("Invalid official Mach-O executable slice")
    return sizes


def desktop_size(outer, platform, kind, threads):
    name = (f"windows_{kind}_x86_64.exe" if platform == "windows" else
            f"linux_{kind}.x86_64" if platform == "linux" else
            f"web_{kind}.zip" if threads else f"web_nothreads_{kind}.zip")
    item = entry(outer, "templates/" + name)
    if platform == "web":
        with nested_archive(outer, "templates/" + name) as nested:
            wasm = entry(nested, "godot.wasm")
            if header(nested, wasm, 8) != b"\x00asm\x01\x00\x00\x00":
                raise ValueError("Invalid official WASM header")
            return wasm.file_size
    data = header(outer, item, 65536)
    if platform == "windows":
        if len(data) < 64 or data[:2] != b"MZ":
            raise ValueError("Invalid official PE header")
        offset = struct.unpack_from("<I", data, 60)[0]
        if (offset < 64 or offset + 94 > len(data) or data[offset:offset + 4] != b"PE\x00\x00"
                or struct.unpack_from("<H", data, offset + 4)[0] != 0x8664
                or struct.unpack_from("<H", data, offset + 24)[0] != 0x20B
                or struct.unpack_from("<H", data, offset + 92)[0] != 2):
            raise ValueError("Expected official x86_64 GUI executable")
    elif (len(data) < 20 or data[:4] != b"\x7fELF" or data[4:6] != b"\x02\x01"
          or struct.unpack_from("<H", data, 18)[0] != 62):
        raise ValueError("Expected official x86_64 ELF executable")
    return item.file_size


def measure(archive, identifier, targets):
    rows = []
    with zipfile.ZipFile(archive) as outer:
        version = entry(outer, "templates/version.txt")
        if version.file_size > 64 or outer.read(version).decode().strip() != identifier:
            raise ValueError("Official archive version.txt does not match the requested release")
        groups = {}
        for target in targets:
            groups.setdefault((target["platform"], target["template_kind"], target["web_threads"]), []).append(target)
        for (platform, kind, threads), group in groups.items():
            if platform == "android":
                with nested_archive(outer, f"templates/android_{kind}.apk") as android:
                    for target in group:
                        rows.append(dict(target, binary_size_bytes=android_size(android, target["architecture"])))
            elif platform == "macos":
                # One app bundle contains both kinds; each entry is a fat binary.
                with nested_archive(outer, "templates/macos.zip") as macos:
                    sizes = macos_sizes(macos, kind)
                    for target in group:
                        rows.append(dict(target, binary_size_bytes=sizes[target["architecture"]]))
            elif platform in ("linux", "windows", "web"):
                for target in group:
                    rows.append(dict(target, binary_size_bytes=desktop_size(outer, platform, kind, threads)))
            else:
                raise ValueError("Unsupported official reference platform")
    return rows


if __name__ == "__main__":
    archive, identifier, plan = sys.argv[1:]
    print(json.dumps(measure(archive, identifier, json.loads(plan))))
