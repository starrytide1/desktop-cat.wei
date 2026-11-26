"""生成 Windows .lnk 快捷方式（不依赖 COM / WScript.Shell）。

用法:
    python make_shortcut.py [输出路径]

默认在桌面生成「PawPal 外观编辑器.lnk」，指向同目录 deliverables 中的 PawPal.exe，
并带上 --appearance 参数，双击即可直接打开桌宠的外观编辑器。

重要：Windows Shell 解析 .lnk 时优先使用 LinkTargetIDList。早期纯标准库实现只写了
LinkInfo，生成的文件虽能被解析出路径，但 ShellExecute 会报「没有应用程序与此操作
的指定文件有关联」，双击无反应。现在优先使用 pylnk3==0.4.3（仅构建期依赖，不进入
运行时、不联网）生成带 IDList 的标准 Shell Link：

    python -m pip install pylnk3==0.4.3

未安装时回退到旧的纯标准库实现，并打印警告；回退产物可能同样无法被 Shell 执行。
"""
import os
import struct
import sys

CLSID = bytes.fromhex("0114020000000000c000000000000046")  # Shell link CLSID


def u16(value):
    return struct.pack("<H", value)


def u32(value):
    return struct.pack("<I", value)


def wide_string(text):
    """StringData 项：字符数 + UTF-16LE 内容（不含结尾 NUL）。"""
    return u16(len(text)) + text.encode("utf-16le")


def build_lnk(target, arguments="", working_dir="", description="", icon_location="", show_command=1):
    # LinkInfo / VolumeID：本地固定磁盘
    volume_label = b"\x00"
    volume_id = u32(20) + u32(3) + u32(0) + u32(0x10) + volume_label.ljust(4, b"\x00")
    assert len(volume_id) == 20

    local_base = target.encode("mbcs") + b"\x00"
    common_suffix = b"\x00"
    li_header_size = 0x1C
    volume_offset = li_header_size
    local_offset = volume_offset + len(volume_id)
    suffix_offset = local_offset + len(local_base)

    li_body = (
        u32(li_header_size)
        + u32(1)  # VolumeIDAndLocalBasePath
        + u32(volume_offset)
        + u32(local_offset)
        + u32(0)  # CommonNetworkRelativeLinkOffset
        + u32(suffix_offset)
        + volume_id
        + local_base
        + common_suffix
    )
    link_info = u32(4 + len(li_body)) + li_body

    flags = 0x02 | 0x80  # HasLinkInfo | IsUnicode
    if description:
        flags |= 0x04  # HasNameString
    if working_dir:
        flags |= 0x10  # HasWorkingDir
    if arguments:
        flags |= 0x20  # HasArguments
    if icon_location:
        flags |= 0x40  # HasIconLocation

    header = (
        u32(0x4C)
        + CLSID
        + u32(flags)
        + u32(0x20)  # FILE_ATTRIBUTE_ARCHIVE
        + b"\x00" * 24  # Creation / Access / Write time
        + u32(0)  # FileSize
        + u32(0)  # IconIndex
        + u32(show_command)
        + u16(0)  # HotKey
        + u16(0)
        + u32(0)
        + u32(0)  # Reserved
    )
    assert len(header) == 76, len(header)

    strings = (
        wide_string(description)
        + wide_string(working_dir)
        + wide_string(arguments)
        + wide_string(icon_location)
    )
    return header + link_info + strings + b"\x00" * 4  # ExtraData terminal


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    exe = os.path.join(root, "deliverables", "PawPal.exe")
    if not os.path.isfile(exe):
        raise SystemExit(f"找不到主程序: {exe}")

    if len(sys.argv) > 1:
        out = sys.argv[1]
    else:
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        if not os.path.isdir(desktop):
            raise SystemExit(f"找不到桌面目录: {desktop}")
        out = os.path.join(desktop, "PawPal 外观编辑器.lnk")

    try:
        from pylnk3 import for_file
    except ImportError:
        print("警告：未安装 pylnk3==0.4.3，回退到纯标准库实现；该实现缺少 IDList，可能被 Windows Shell 拒绝。")
        data = build_lnk(
            target=exe,
            arguments="--appearance",
            working_dir=os.path.dirname(exe),
            description="PawPal 外观编辑器",
            icon_location=f"{exe},0",
        )
        with open(out, "wb") as fh:
            fh.write(data)
        # 自检：确认结构可被解析回预期值
        assert data[:4] == u32(0x4C)
        assert data[4:20] == CLSID
        assert struct.unpack_from("<I", data, 20)[0] & 0x02
        assert exe.encode("mbcs") in data
        assert "--appearance".encode("utf-16le") in data
    else:
        lnk = for_file(
            exe,
            arguments="--appearance",
            description="PawPal 外观编辑器",
            work_dir=os.path.dirname(exe),
        )
        lnk.save(out)
        with open(out, "rb") as fh:
            data = fh.read()
        # 自检：必须带 HasLinkTargetIDList，否则 ShellExecute 会拒绝执行
        assert struct.unpack_from("<I", data, 20)[0] & 0x01

    print(f"已生成: {out}")
    print(f"目标: {exe} --appearance")
    print(f"大小: {len(data)} bytes")
    print("自检通过")


if __name__ == "__main__":
    main()
