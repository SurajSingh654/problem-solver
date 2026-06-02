import { describe, it, expect } from 'vitest'
import { normalizeProblemTitle } from '../../src/utils/titleSimilarity.js'

describe('normalizeProblemTitle', () => {
  describe('degenerate inputs (should normalize)', () => {
    it('all-lowercase → Title Case', () => {
      expect(normalizeProblemTitle('two sum')).toBe('Two Sum')
      expect(normalizeProblemTitle('valid parentheses')).toBe('Valid Parentheses')
      expect(normalizeProblemTitle('merge two sorted lists')).toBe('Merge Two Sorted Lists')
    })

    it('all-uppercase → Title Case', () => {
      expect(normalizeProblemTitle('TWO SUM')).toBe('Two Sum')
      expect(normalizeProblemTitle('VALID PARENTHESES')).toBe('Valid Parentheses')
    })

    it('slug-style (hyphens) → Title Case with spaces', () => {
      expect(normalizeProblemTitle('two-sum')).toBe('Two Sum')
      expect(normalizeProblemTitle('longest-substring-without-repeating-characters'))
        .toBe('Longest Substring Without Repeating Characters')
    })

    it('underscored → Title Case with spaces', () => {
      expect(normalizeProblemTitle('two_sum')).toBe('Two Sum')
    })
  })

  describe('smallwords stay lowercase in the middle', () => {
    it('articles, conjunctions, prepositions are lowercased', () => {
      expect(normalizeProblemTitle('best time to buy and sell stock'))
        .toBe('Best Time to Buy and Sell Stock')
      expect(normalizeProblemTitle('number of islands')).toBe('Number of Islands')
      expect(normalizeProblemTitle('house robber ii')).toBe('House Robber II')
    })

    it('first word is always capitalized even if a smallword', () => {
      expect(normalizeProblemTitle('a star algorithm')).toBe('A Star Algorithm')
      expect(normalizeProblemTitle('the matrix')).toBe('The Matrix')
    })

    it('last word is always capitalized even if a smallword', () => {
      // "to" is a smallword but it's the last word → capitalized.
      expect(normalizeProblemTitle('the way to go to')).toBe('The Way to Go To')
    })
  })

  describe('Roman numerals', () => {
    it('uppercases length-2+ Roman numerals', () => {
      expect(normalizeProblemTitle('meeting rooms ii')).toBe('Meeting Rooms II')
      expect(normalizeProblemTitle('course schedule iii')).toBe('Course Schedule III')
      expect(normalizeProblemTitle('best time to buy and sell stock iv'))
        .toBe('Best Time to Buy and Sell Stock IV')
    })

    it('does not uppercase single-letter "i" / "v" / "x"', () => {
      // Single-letter Roman risk: could collide with real words. Length-1 path
      // falls through to default capitalization.
      expect(normalizeProblemTitle('i robot')).toBe('I Robot')
    })
  })

  describe('mixed-case pass-through (preserves acronyms)', () => {
    it('does not mangle correctly-cased acronyms', () => {
      expect(normalizeProblemTitle('BST Iterator')).toBe('BST Iterator')
      expect(normalizeProblemTitle('LRU Cache')).toBe('LRU Cache')
      expect(normalizeProblemTitle('LFU Cache')).toBe('LFU Cache')
    })

    it('does not mangle proper nouns / camelCase', () => {
      expect(normalizeProblemTitle('iPhone Battery Drain')).toBe('iPhone Battery Drain')
      expect(normalizeProblemTitle('macOS Setup')).toBe('macOS Setup')
    })

    it('passes through correctly Title-Cased input untouched', () => {
      expect(normalizeProblemTitle('Two Sum')).toBe('Two Sum')
      expect(normalizeProblemTitle('Best Time to Buy and Sell Stock'))
        .toBe('Best Time to Buy and Sell Stock')
    })

    it('does NOT split hyphenated English compounds in mixed-case titles', () => {
      // The hyphen here is a real compound word, not a slug separator.
      // Helper must leave it alone because of the existing capitals.
      expect(normalizeProblemTitle('What are the trade-offs between Stack and Heap memory?'))
        .toBe('What are the trade-offs between Stack and Heap memory?')
      expect(normalizeProblemTitle('Real-World System Design'))
        .toBe('Real-World System Design')
    })
  })

  describe('edge cases', () => {
    it('handles empty / whitespace input', () => {
      expect(normalizeProblemTitle('')).toBe('')
      expect(normalizeProblemTitle('   ')).toBe('')
    })

    it('handles non-string input gracefully', () => {
      expect(normalizeProblemTitle(null)).toBe(null)
      expect(normalizeProblemTitle(undefined)).toBe(undefined)
      expect(normalizeProblemTitle(42)).toBe(42)
    })

    it('trims leading/trailing whitespace', () => {
      expect(normalizeProblemTitle('  two sum  ')).toBe('Two Sum')
    })

    it('idempotent — running twice produces the same output', () => {
      const inputs = [
        'two sum',
        'meeting rooms ii',
        'longest-substring-without-repeating-characters',
        'BST Iterator',
        'best time to buy and sell stock',
      ]
      for (const input of inputs) {
        const once = normalizeProblemTitle(input)
        const twice = normalizeProblemTitle(once)
        expect(twice).toBe(once)
      }
    })

    it('collapses repeated separators', () => {
      expect(normalizeProblemTitle('two--sum')).toBe('Two Sum')
      expect(normalizeProblemTitle('two___sum')).toBe('Two Sum')
    })
  })
})
