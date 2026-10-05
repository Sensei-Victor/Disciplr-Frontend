import React, { useRef, useEffect } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Text, VALID_TYPOGRAPHY_ROLES, DEFAULT_TYPOGRAPHY_ROLE } from '../Text'
import type { TypographyRole } from '../../utils/typography'

describe('Text Component', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  describe('Standard / Success operation', () => {
    it('renders a span by default', () => {
      render(<Text role="body">Test text</Text>)
      const element = screen.getByText('Test text')
      expect(element.tagName).toBe('SPAN')
    })

    it('renders the requested element via as prop', () => {
      render(<Text role="title" as="h1">Heading 1</Text>)
      expect(screen.getByText('Heading 1').tagName).toBe('H1')

      render(<Text role="subtitle" as="h2">Heading 2</Text>)
      expect(screen.getByText('Heading 2').tagName).toBe('H2')

      render(<Text role="body" as="p">Paragraph</Text>)
      expect(screen.getByText('Paragraph').tagName).toBe('P')

      render(<Text role="caption" as="small">Small text</Text>)
      expect(screen.getByText('Small text').tagName).toBe('SMALL')

      render(<Text role="mono" as="code">Code text</Text>)
      expect(screen.getByText('Code text').tagName).toBe('CODE')

      render(<Text role="body" as="label">Label text</Text>)
      expect(screen.getByText('Label text').tagName).toBe('LABEL')
    })

    it('applies the correct typography class for each supported role', () => {
      const roles: TypographyRole[] = ['display', 'title', 'subtitle', 'body', 'caption', 'mono']
      for (const role of roles) {
        const { unmount } = render(<Text role={role}>{role} content</Text>)
        const el = screen.getByText(`${role} content`)
        expect(el).toHaveClass(`text-${role}`)
        unmount()
      }
    })

    it('exports VALID_TYPOGRAPHY_ROLES and DEFAULT_TYPOGRAPHY_ROLE constants', () => {
      expect(VALID_TYPOGRAPHY_ROLES).toContain('display')
      expect(VALID_TYPOGRAPHY_ROLES).toContain('title')
      expect(VALID_TYPOGRAPHY_ROLES).toContain('subtitle')
      expect(VALID_TYPOGRAPHY_ROLES).toContain('body')
      expect(VALID_TYPOGRAPHY_ROLES).toContain('caption')
      expect(VALID_TYPOGRAPHY_ROLES).toContain('mono')
      expect(DEFAULT_TYPOGRAPHY_ROLE).toBe('body')
    })

    it('merges caller className with typography class', () => {
      render(<Text role="body" className="custom-class font-bold">Custom class</Text>)
      const element = screen.getByText('Custom class')
      expect(element).toHaveClass('text-body', 'custom-class', 'font-bold')
    })

    it('works cleanly without a className prop', () => {
      render(<Text role="caption">No class</Text>)
      const element = screen.getByText('No class')
      expect(element).toHaveClass('text-caption')
      expect(element.className).toBe('text-caption')
    })

    it('combines typography role with multiple extra classes', () => {
      render(<Text role="body" className="font-bold underline text-accent">Styled</Text>)
      const element = screen.getByText('Styled')
      expect(element).toHaveClass('text-body', 'font-bold', 'underline', 'text-accent')
      expect(element.className).toBe('text-body font-bold underline text-accent')
    })

    it('forwards ref to the rendered DOM node (callback ref)', () => {
      let capturedNode: HTMLElement | null = null
      render(
        <Text
          role="body"
          ref={(node) => {
            capturedNode = node
          }}
        >
          Callback ref test
        </Text>
      )
      expect(capturedNode).not.toBeNull()
      expect(capturedNode?.tagName).toBe('SPAN')
      expect(capturedNode?.textContent).toBe('Callback ref test')
    })

    it('forwards ref to the rendered DOM node (useRef harness)', () => {
      let capturedRef: HTMLElement | null = null

      const TestComponent = () => {
        const ref = useRef<HTMLElement>(null)
        useEffect(() => {
          capturedRef = ref.current
        }, [])
        return <Text role="body" ref={ref}>UseRef test</Text>
      }

      render(<TestComponent />)
      expect(capturedRef).not.toBeNull()
      expect(capturedRef?.textContent).toBe('UseRef test')
    })

    it('passes through arbitrary HTML attributes and event handlers', () => {
      const handleClick = vi.fn()
      render(
        <Text
          role="body"
          id="test-id"
          style={{ color: 'red' }}
          data-testid="text-element"
          aria-label="Test label"
          onClick={handleClick}
        >
          Attributes test
        </Text>
      )
      const element = screen.getByTestId('text-element')
      expect(element).toHaveAttribute('id', 'test-id')
      expect(element).toHaveStyle('color: rgb(255, 0, 0)')
      expect(element).toHaveAttribute('aria-label', 'Test label')

      fireEvent.click(element)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('Deduplication & class normalization boundaries', () => {
    it('deduplicates duplicate class tokens provided in className', () => {
      render(
        <Text role="body" className="custom-class custom-class extra extra">
          Duplicate classes
        </Text>
      )
      const element = screen.getByText('Duplicate classes')
      expect(element.className).toBe('text-body custom-class extra')
    })

    it('does not duplicate the role class if caller includes it in className', () => {
      render(
        <Text role="body" className="text-body custom-class">
          Same role class
        </Text>
      )
      const element = screen.getByText('Same role class')
      expect(element.className).toBe('text-body custom-class')
    })

    it('normalizes extra whitespace in className without trailing or leading spaces', () => {
      render(
        <Text role="title" className="   my-class   another-class   ">
          Whitespace class
        </Text>
      )
      const element = screen.getByText('Whitespace class')
      expect(element.className).toBe('text-title my-class another-class')
    })

    it('handles empty string or whitespace-only className gracefully', () => {
      render(<Text role="mono" className="   ">Whitespace only</Text>)
      const element = screen.getByText('Whitespace only')
      expect(element.className).toBe('text-mono')
    })
  })

  describe('Boundary-case inputs for children and as prop', () => {
    it('renders numerical 0 as children without swallowing it', () => {
      render(<Text role="body">{0}</Text>)
      expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('handles empty string children without crashing', () => {
      const { container } = render(<Text role="body">{''}</Text>)
      const span = container.querySelector('span')
      expect(span).toBeInTheDocument()
      expect(span?.textContent).toBe('')
    })

    it('handles null and undefined children without crashing', () => {
      const { container: c1 } = render(<Text role="body">{null}</Text>)
      expect(c1.querySelector('span')).toBeInTheDocument()

      const { container: c2 } = render(<Text role="body">{undefined}</Text>)
      expect(c2.querySelector('span')).toBeInTheDocument()
    })

    it('handles boolean children without crashing', () => {
      const { container } = render(<Text role="body">{false}</Text>)
      expect(container.querySelector('span')).toBeInTheDocument()
    })

    it('falls back to span when as prop is empty string or whitespace', () => {
      render(<Text role="body" as={'' as any}>Empty as</Text>)
      expect(screen.getByText('Empty as').tagName).toBe('SPAN')

      render(<Text role="body" as={'   ' as any}>Whitespace as</Text>)
      expect(screen.getByText('Whitespace as').tagName).toBe('SPAN')
    })

    it('falls back to span when as prop is null or undefined', () => {
      render(<Text role="body" as={null as any}>Null as</Text>)
      expect(screen.getByText('Null as').tagName).toBe('SPAN')

      render(<Text role="body" as={undefined}>Undefined as</Text>)
      expect(screen.getByText('Undefined as').tagName).toBe('SPAN')
    })

    it('supports custom React component passed to as prop', () => {
      const CustomBox = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
        (props, ref) => <div ref={ref} data-testid="custom-box" {...props} />
      )
      CustomBox.displayName = 'CustomBox'

      render(
        <Text role="title" as={CustomBox}>
          Custom component text
        </Text>
      )
      const element = screen.getByTestId('custom-box')
      expect(element).toBeInTheDocument()
      expect(element).toHaveClass('text-title')
      expect(element).toHaveTextContent('Custom component text')
    })
  })

  describe('Failure paths & invalid input recovery', () => {
    it('falls back to text-body and logs warning when role is unrecognized', () => {
      render(<Text role={'invalid-role' as any}>Invalid role</Text>)
      const element = screen.getByText('Invalid role')
      expect(element).toHaveClass('text-body')
      expect(element.className).not.toContain('undefined')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid or missing typography role "invalid-role"')
      )
    })

    it('falls back to text-body and logs warning when role is null or undefined', () => {
      render(<Text role={null as any}>Null role</Text>)
      const el1 = screen.getByText('Null role')
      expect(el1).toHaveClass('text-body')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid or missing typography role "null"')
      )

      render(<Text role={undefined as any}>Undefined role</Text>)
      const el2 = screen.getByText('Undefined role')
      expect(el2).toHaveClass('text-body')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid or missing typography role "undefined"')
      )
    })

    it('falls back to text-body and logs warning when role is empty string', () => {
      render(<Text role={'' as any}>Empty role</Text>)
      const element = screen.getByText('Empty role')
      expect(element).toHaveClass('text-body')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid or missing typography role ""')
      )
    })
  })

  describe('Concurrency, idempotence, and memoization stability', () => {
    it('renders multiple instances in parallel with isolated, deterministic results', () => {
      render(
        <div>
          <Text role="display" data-testid="t1">T1</Text>
          <Text role="title" data-testid="t2">T2</Text>
          <Text role="body" data-testid="t3">T3</Text>
          <Text role="caption" data-testid="t4">T4</Text>
          <Text role="mono" data-testid="t5">T5</Text>
        </div>
      )

      expect(screen.getByTestId('t1')).toHaveClass('text-display')
      expect(screen.getByTestId('t2')).toHaveClass('text-title')
      expect(screen.getByTestId('t3')).toHaveClass('text-body')
      expect(screen.getByTestId('t4')).toHaveClass('text-caption')
      expect(screen.getByTestId('t5')).toHaveClass('text-mono')
    })

    it('maintains Text displayName for debugging and React DevTools', () => {
      expect(Text.displayName).toBe('Text')
    })
  })

  describe('Validation & Invariants', () => {
    it('falls back to body role for invalid runtime role', () => {
      // @ts-expect-error Testing invalid runtime input
      render(<Text role="invalid-role" data-testid="invalid-role-test">Invalid role</Text>)
      expect(screen.getByTestId('invalid-role-test')).toHaveClass('text-body')
    })

    it('falls back to span for invalid as component prop', () => {
      // @ts-expect-error Testing invalid runtime input
      render(<Text role="body" as={123} data-testid="invalid-as-test">Invalid as</Text>)
      expect(screen.getByTestId('invalid-as-test').tagName).toBe('SPAN')

      // Testing invalid string for `as`
      // @ts-expect-error Testing invalid runtime input
      render(<Text role="body" as="<script>" data-testid="invalid-as-string-test">Invalid as string</Text>)
      expect(screen.getByTestId('invalid-as-string-test').tagName).toBe('SPAN')
    })

    it('handles undefined className safely', () => {
      render(<Text role="title" className={undefined} data-testid="undefined-class-test">Undefined class</Text>)
      expect(screen.getByTestId('undefined-class-test').className).toBe('text-title')
    })
  })
})
