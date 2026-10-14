//go:build windows

package main

import (
	"fmt"
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	ofnExplorer      = 0x00080000
	ofnFileMustExist = 0x00001000
	ofnPathMustExist = 0x00000800
	ofnHideReadOnly  = 0x00000004
	ofnNoChangeDir   = 0x00000008
	wsExTopmost      = 0x00000008
	wsPopup          = 0x80000000
	swShow           = 5
	swHide           = 0
	maxPathWideChars = 32768
	coinitApartment  = 0x2
	sOK              = 0
	sFalse           = 1
)

var (
	comdlg32               = windows.NewLazySystemDLL("comdlg32.dll")
	procGetOpenFileNameW   = comdlg32.NewProc("GetOpenFileNameW")
	procCommDlgExtendedErr = comdlg32.NewProc("CommDlgExtendedError")

	user32                  = windows.NewLazySystemDLL("user32.dll")
	procCreateWindowExW     = user32.NewProc("CreateWindowExW")
	procDestroyWindow       = user32.NewProc("DestroyWindow")
	procShowWindow          = user32.NewProc("ShowWindow")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procBringWindowToTop    = user32.NewProc("BringWindowToTop")
	procSetWindowPos        = user32.NewProc("SetWindowPos")

	ole32              = windows.NewLazySystemDLL("ole32.dll")
	procCoInitializeEx = ole32.NewProc("CoInitializeEx")
	procCoUninitialize = ole32.NewProc("CoUninitialize")

	pickMu sync.Mutex
)

type openFileNameW struct {
	StructSize      uint32
	Owner           windows.HWND
	Instance        windows.Handle
	Filter          *uint16
	CustomFilter    *uint16
	MaxCustomFilter uint32
	FilterIndex     uint32
	File            *uint16
	MaxFile         uint32
	FileTitle       *uint16
	MaxFileTitle    uint32
	InitialDir      *uint16
	Title           *uint16
	Flags           uint32
	FileOffset      uint16
	FileExtension   uint16
	DefExt          *uint16
	CustData        uintptr
	FnHook          uintptr
	TemplateName    *uint16
	PvReserved      uintptr
	DwReserved      uint32
	FlagsEx         uint32
}

func pick(title string, filters []filter) (string, error) {
	pickMu.Lock()
	defer pickMu.Unlock()

	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	hr, _, _ := procCoInitializeEx.Call(0, coinitApartment)
	if hr == sOK || hr == sFalse {
		defer procCoUninitialize.Call()
	}

	owner, err := createTopMostOwner()
	if err != nil {
		return "", fmt.Errorf("file picker owner window: %w", err)
	}
	defer destroyWindow(owner)
	raiseOwner(owner)

	filterUTF16 := utf16DoubleNull(comdlgFilterPairs(filters))
	titlePtr, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return "", err
	}

	buf := make([]uint16, maxPathWideChars)
	ofn := openFileNameW{
		StructSize:  uint32(unsafe.Sizeof(openFileNameW{})),
		Owner:       owner,
		Filter:      &filterUTF16[0],
		FilterIndex: 1,
		File:        &buf[0],
		MaxFile:     uint32(len(buf)),
		Title:       titlePtr,
		Flags:       ofnExplorer | ofnFileMustExist | ofnPathMustExist | ofnHideReadOnly | ofnNoChangeDir,
	}

	r, _, callErr := procGetOpenFileNameW.Call(uintptr(unsafe.Pointer(&ofn)))
	if r == 0 {
		ext, _, _ := procCommDlgExtendedErr.Call()
		if ext == 0 {
			return "", nil
		}
		if callErr != nil && callErr != syscall.Errno(0) {
			return "", fmt.Errorf("file picker failed: CommDlgExtendedError=%d (%v)", ext, callErr)
		}
		return "", fmt.Errorf("file picker failed: CommDlgExtendedError=%d", ext)
	}
	return windows.UTF16ToString(buf), nil
}

func comdlgFilterPairs(filters []filter) []string {
	if len(filters) == 0 {
		return []string{"All files (*.*)", "*.*"}
	}
	parts := make([]string, 0, (len(filters)+1)*2)
	for _, f := range filters {
		name := f.Name
		if name == "" {
			name = "Files"
		}
		patterns := make([]string, 0, len(f.Extensions))
		for _, e := range f.Extensions {
			patterns = append(patterns, "*."+e)
		}
		if len(patterns) == 0 {
			patterns = []string{"*.*"}
		}
		joined := joinSemi(patterns)
		parts = append(parts, name+" ("+joined+")", joined)
	}
	parts = append(parts, "All files (*.*)", "*.*")
	return parts
}

func joinSemi(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ";"
		}
		out += p
	}
	return out
}

func createTopMostOwner() (windows.HWND, error) {
	className, err := windows.UTF16PtrFromString("STATIC")
	if err != nil {
		return 0, err
	}
	windowName, err := windows.UTF16PtrFromString("DetourPickFile")
	if err != nil {
		return 0, err
	}
	r, _, callErr := procCreateWindowExW.Call(
		wsExTopmost,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(windowName)),
		wsPopup,
		0, 0, 1, 1,
		0, 0, 0, 0,
	)
	if r == 0 {
		if callErr != nil && callErr != syscall.Errno(0) {
			return 0, callErr
		}
		return 0, fmt.Errorf("CreateWindowExW failed")
	}
	return windows.HWND(r), nil
}

func raiseOwner(hwnd windows.HWND) {
	if hwnd == 0 {
		return
	}
	const hwndTopMost = ^uintptr(0)
	const swpNosize = 0x0001
	const swpNomove = 0x0002
	const swpShowWindow = 0x0040
	_, _, _ = procShowWindow.Call(uintptr(hwnd), swShow)
	_, _, _ = procSetWindowPos.Call(uintptr(hwnd), hwndTopMost, 0, 0, 0, 0, swpNosize|swpNomove|swpShowWindow)
	_, _, _ = procBringWindowToTop.Call(uintptr(hwnd))
	_, _, _ = procSetForegroundWindow.Call(uintptr(hwnd))
}

func destroyWindow(hwnd windows.HWND) {
	if hwnd == 0 {
		return
	}
	_, _, _ = procShowWindow.Call(uintptr(hwnd), swHide)
	_, _, _ = procDestroyWindow.Call(uintptr(hwnd))
}

func utf16DoubleNull(parts []string) []uint16 {
	out := make([]uint16, 0, 64)
	for _, p := range parts {
		u, err := windows.UTF16FromString(p)
		if err != nil {
			continue
		}
		out = append(out, u...)
	}
	out = append(out, 0)
	return out
}
