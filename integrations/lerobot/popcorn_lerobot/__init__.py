"""POPCORN witness for LeRobot: receipts for robot lessons.

Fingerprints each recorded episode at capture, chains the records in
order, and lets any stranger verify a downloaded dataset offline
against the witness's published keys. Recording is a dry run by
default: nothing is sent, nothing is spent. A signed receipt from the
live witness costs $0.001 and is requested only by an operator who has
satisfied the execution gate.
"""

__version__ = "0.1.0"
