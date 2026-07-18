package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	agentKernel32    = syscall.NewLazyDLL("kernel32.dll")
	procCreateMutexW = agentKernel32.NewProc("CreateMutexW")
	agentMutexHandle uintptr
)

func acquireAgentInstance() error {
	name := syscall.StringToUTF16Ptr(`Local\CodexRemoteAgent`)
	h, _, callErr := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return fmt.Errorf("create agent mutex: %w", callErr)
	}
	agentMutexHandle = h
	if callErr == syscall.Errno(183) {
		return fmt.Errorf("another Codex Remote Agent is already running")
	}
	return nil
}
