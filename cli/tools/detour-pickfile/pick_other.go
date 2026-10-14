//go:build !windows

package main

import "fmt"

func pick(title string, filters []filter) (string, error) {
	_ = title
	_ = filters
	return "", fmt.Errorf("detour-pickfile native dialog is Windows-only; use compiled NSOpenPanel / zenity via the host")
}
