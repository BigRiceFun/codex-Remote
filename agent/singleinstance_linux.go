package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

var agentLockFile *os.File

func acquireAgentInstance() error {
	path := filepath.Join(os.TempDir(), fmt.Sprintf("codex-remote-agent-%d.lock", os.Getuid()))
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return fmt.Errorf("open agent lock: %w", err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return fmt.Errorf("another Codex Remote Agent is already running")
		}
		return fmt.Errorf("lock agent instance: %w", err)
	}
	agentLockFile = file
	return nil
}
