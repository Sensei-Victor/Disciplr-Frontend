import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Message from "../Messages";

describe("Message Component", () => {
  // A fixed ISO timestamp; the rendered timeAgo is computed by formatRelativeTime
  // so we just verify it renders something (non-empty) rather than a hardcoded string.
  const defaultProps = {
    id: "msg-123",
    type: "funds_released",
    title: "Funds Released Successfully",
    message: "Your funds have been released from the escrow vault.",
    timestamp: "2025-01-01T00:00:00Z",
    read: false,
    isFullPage: false,
    setRead: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    // Ensure deterministic time formatting across all tests.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders message details correctly when unread and not full page", () => {
    render(<Message {...defaultProps} />);

    // Assert title is rendered
    expect(screen.getByText(defaultProps.title)).toBeInTheDocument();

    // Assert message is truncated to 30 characters + ellipsis in preview
    expect(screen.getByText(/Your funds have been released.*.../)).toBeInTheDocument();

    // Assert a relative time label is rendered (non-empty, computed from timestamp)
    const timeLabel = screen.getByTestId("message-time-ago");
    expect(timeLabel.textContent).toBeTruthy();

    // Assert "New" badge is rendered because read is false
    expect(screen.getByText("New")).toBeInTheDocument();

    // Assert notification icon is rendered with the correct aria-label and role
    const icon = screen.getByRole("img", { name: "Funds released" });
    expect(icon).toBeInTheDocument();

    // Assert "Delete" button is not rendered when isFullPage is false
    expect(screen.queryBuRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("renders message details correctly when read and isFullPage is true", () => {
    const props = {
      ...defaultProps,
      read: true,
      isFullPage: true,
    };
    render(<Message {...props} />);

    // Assert title is rendered
    expect(screen.getByText(props.title)).toBeInTheDocument();

    // Assert "New" badge is not rendered because read is true
    expect(screen.queryByText("New")).not.toBeInTheDocument();

    // Assert "Delete" button is rendered when isFullPage is true
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("clicking the Delete button calls onDismiss with the message id", () => {
    const onDismissMock = vi.fn();
    const props = {
      ...defaultProps,
      isFullPage: true,
      onDismiss: onDismissMock,
    };
    render(<Message {...props} />);

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);

    expect(onDismissMock).toHaveBeenCalledTimes(1);
    expect(onDismissMock).toHaveBeenCalledWith(props.id);
  });

  it("clicking the title opens the expanded view and calls setRead with the item's id", () => {
    const setReadMock = vi.fn();
    const props = {
      ...defaultProps,
      setRead: setReadMock,
    };
    render(<Message {...props} />);

    // Prior to clicking, the full message should not be visible (only the truncated preview is)
    expect(screen.queryByText(props.message)).not.toBeInTheDocument();

    // Click the title to open the overlay
    const titleElement = screen.getByText(props.title);
    fireEvent.click(titleElement);

    // Assert setRead mock was called with correct id
    expect(setReadMock).toHaveBeenCalledTimes(1);
    expect(setReadMock).toHaveBeenCalledWith(props.id);

    // Assert the expanded view / overlay is now open and contains the full message text
    const fullMessageElement = screen.getByText(props.message);
    expect(fullMessageElement).toBeInTheDocument();
  });

  it("the expanded overlay closes when its close control is activated", () => {
    render(<Message {...defaultProps} />);

    // Open the overlay
    const titleElement = screen.getByText(defaultProps.title);
    fireEvent.click(titleElement);

    // Verify overlay is open
    expect(screen.getByText(defaultProps.message)).toBeInTheDocument();

    // Click the close control "X"
    const closeButton = screen.getByText("X");
    fireEvent.click(closeButton);

    // Verify overlay is closed (full message is removed)
    expect(screen.queryByText(defaultProps.message)).not.toBeInTheDocument();
  });

  it("long messages are truncated as expected", () => {
    const props = {
      ...defaultProps,
      message: "This is a super long message that contains more than thirty characters.",
    };
    render(<Message {...props} />);

    // Message length is 72, which is > 30.
    // Truncated preview should be exactly 30 characters plus " ..."
    expect(screen.getByText(/This is a super long message t.*.../)).toBeInTheDocument();
  });

  it("applies correct container styling depending on the isFullPage prop when overlay is open", () => {
    // Case 1: isFullPage is true
    const { rerender } = render(<Message {...defaultProps} isFullPage={true} />);

    // Open overlay
    fireEvent.click(screen.getByText(defaultProps.title));

    // Get overlay container (grandparent of the full message element in the overlay)
    const fullMsg1 = screen.getByText(defaultProps.message);
    const container1 = fullMsg1.parentElement?.parentElement;
    expect(container1).toBeInTheDocument();
    
    // Check that it contains full-page classes
    expect(container1).toHaveClass("w-[90%]");
    expect(container1).toHaveClass("lg:w-[40%]");
    expect(container1).toHaveClass("h-auto");
    expect(container1).toHaveClass("min-h-[40%]");
    expect(container1).toHaveClass("bg-white");
    expect(container1).toHaveClass("left-[50%]");
    expect(container1).toHaveClass("translate-x-[-50%]");
    expect(container1).toHaveClass("top-[5%]");
    expect(container1).not.toHaveClass("w-full");
    expect(container1).not.toHaveClass("h-full");

    // Close the overlay
    fireEvent.click(screen.getByText("X"));

    // Case 2: isFullPage is false
    rerender(<Message {...defaultProps} isFullPage={false} />);

    // Open overlay
    fireEvent.click(screen.getByText(defaultProps.title));

    const fullMsg2 = screen.getByText(defaultProps.message);
    const container2 = fullMsg2.parentElement?.parentElement;
    expect(container2).toBeInTheDocument();

    // Check that it contains dropdown/non-full-page classes
    expect(container2).toHaveClass("w-full");
    expect(container2).toHaveClass("h-full");
    expect(container2).toHaveClass("bg-white");
    expect(container2).toHaveClass("left-0");
    expect(container2).toHaveClass("top-0");
    expect(container2).not.toHaveClass("w-[90%]");
    expect(container2).not.toHaveClass("lg:w-[40%]");
  });

  // -------------------------------------------------------------------------
  // Regression coverage: validation, authorization, state transitions, and
  // adverse inputs. These tests enforce the module's invariants.
  // -------------------------------------------------------------------------

  describe("validation invariants", () => {
    it("renders a safe fallback and does not crash when the title is empty", () => {
      render(<Message {...defaultProps} title="" />);
      // The component must still render a node with an accessible name.
      const heading = screen.getByTestId("message-title");
      expect(heading).toBeInTheDocument();
      expect(heading.textContent?.trim()).toBeTruthy();
    });

    it("does not crash when the message body is empty", () => {
      render(<Message {...defaultProps} message="" />);
      expect(screen.getByTestId("message-preview")).toBeInTheDocument();
    });

    it("renders a non-empty time label for an invalid timestamp", () => {
      render(<Message {...defaultProps} timestamp="not-a-date" />);
      const timeLabel = screen.getByTestId("message-time-ago");
      expect(timeLabel.textContent?.trim()).toBeTruthy();
    });

    it("renders a generic icon for an unknown notification type", () => {
      render(<Message {...defaultProps} type="unknown_type" />);
      // The icon must always be present with a non-empty accessible name.
      const icon = screen.getByTestId("message-icon");
      expect(icon).toBeInTheDocument();
      expect(icon.getAttribute("aria-label")?.trim()).toBeTruthy();
    });

    it("truncates a boundary-length message of exactly 30 characters without adding an ellipsis", () => {
      const exactlyThirty = "123456789012345678901234567890";
      expect(exactlyThirty).toHaveLength(30);
      render(<Message {...defaultProps} message={exactlyThirty} />);
      const preview = screen.getByTestId("message-preview");
      expect(preview.textContent).toBe(exactlyThirty);
    });

    it("truncates a message of 31 characters to 30 characters plus an ellipsis", () => {
      const thirtyOne = "1234567890123456789012345678901";
      expect(thirtyOne).toHaveLength(31);
      render(<Message {...defaultProps} message={thirtyOne} />);
      const preview = screen.getByTestId("message-preview");
      expect(preview.textContent).toBe(`${thirtyOne.slice(0, 30)} ...`);
    });
  });

  describe("authorization and state transition invariants", () => {
    it("does not invoke setRead when the id is missing", () => {
      const setReadMock = vi.fn();
      render(<Message {...defaultProps} id="" setRead={setReadMock} />);
      fireEvent.click(screen.getByTestId("message-title"));
      expect(setReadMock).not.toHaveBeenCalled();
    });

    it("does not invoke setRead when the id is not a string", () => {
      const setReadMock = vi.fn();
      // @js-ignore -- deliberately pass an invalid type to exercise the guard.
      render(<Message {...defaultProps} id={123 as unknown as string} setRead={setReadMock} />);
      fireEvent.click(screen.getByTestId("message-title"));
      expect(setReadMock).not.toHaveBeenCalled();
    });

    it("still calls setRead exactly once when the title is clicked multiple times", () => {
      const setReadMock = vi.fn();
      render(<Message {...defaultProps} setRead={setReadMock} />);
      const title = screen.getByTestId("message-title");
      fireEvent.click(title);
      fireEvent.click(title);
      fireEvent.click(title);
      expect(setReadMock).toHaveBeenCalledTimes(1);
    });

    it("recovers from a throwing setRead callback without crashing the component", () => {
      const setReadMock = vi.fn(() => {
        throw new Error("update failed");
      });
      render(<Message {...defaultProps} setRead={setReadMock} />);
      expect(() => {
        fireEvent.click(screen.getByTestId("message-title"));
      }).not.toThrow();
      // The overlay must still open so the user can read the message.
      expect(screen.getByTestId("message-overlay")).toBeInTheDocument();
    });

    it("closes the overlay and does not call setRead again when closing", () => {
      const setReadMock = vi.fn();
      render(<Message {...defaultProps} setRead={setReadMock} />);
      fireEvent.click(screen.getByTestId("message-title"));
      expect(setReadMock).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByTestId("message-close"));
      expect(screen.queryByTestId("message-overlay")).not.toBeInTheDocument();
      expect(setReadMock).toHaveBeenCalledTimes(1);
    });

    it("keeps the overlay open when the component re-renders with the same id", () => {
      const { rerender } = render(<Message {...defaultProps} />);
      fireEvent.click(screen.getByTestId("message-title"));
      expect(screen.getByTestId("message-overlay")).toBeInTheDocument();
      rerender(<Message {...defaultProps} read={true} />);
      expect(screen.getByTestId("message-overlay")).toBeInTheDocument();
    });

    it("closes the overlay when the id changes to prevent stale state", () => {
      const { rerender } = render(<Message {...defaultProps} />);
      fireEvent.click(screen.getByTestId("message-title"));
      expect(screen.getByTestId("message-overlay")).toBeInTheDocument();
      rerender(<Message {...defaultProps} id="msg-456" />);
      expect(screen.queryByTestId("message-overlay")).not.toBeInTheDocument();
    });
  });

  describe("concurrent and timing boundaries", () => {
    it("does not call setRead twice when two clicks are dispatched in the same tick", () => {
      const setReadMock = vi.fn();
      render(<Message {...defaultProps} setRead={setReadMock} />);
      const title = screen.getByTestId("message-title");
      fireEvent.click(title);
      fireEvent.click(title);
      expect(setReadMock).toHaveBeenCalledTimes(1);
    });

    it("keeps the overlay open when the close control is clicked and the title is clicked in the same tick", () => {
      const setReadMock = vi.fn();
      render(<Message {...defaultProps} setRead={setReadMock} />);
      const title = screen.getByTestId("message-title");
      fireEvent.click(title);
      const close = screen.getByTestId("message-close");
      fireEvent.click(close);
      fireEvent.click(title);
      // The overlay must end in a deterministic state (open) and setRead must not be called again.
      expect(screen.getByTestId("message-overlay")).toBeInTheDocument();
      expect(setReadMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("observability and privacy", () => {
    const originalError = console.error;
    const errorSpy = vi.fn();

    beforeEach(() => {
      errorSpy.mockReset();
      console.error = errorSpy;
    });

    afterEach(() => {
      console.error = originalError;
    });

    it("logs a diagnosable error without leaking the message body when setRead throws", () => {
      const secret = "secret-body-text";
      const setReadMock = vi.fn(() => {
        throw new Error("update failed");
      });
      render(<Message {...defaultProps} message={secret} setRead={setReadMock} />);
      fireEvent.click(screen.getByTestId("message-title"));
      expect(errorSpy).toHaveBeenCalled();
      const loggedArgs = errorSpy.mock.calls.flat().map((arg) => String(arg));
      expect(loggedArgs.some((arg) => arg.includes("msg-123"))).toBeTrue();
      expect(loggedArgs.some((arg) => arg.includes(secret))).toBe(false);
    });
  });
});
