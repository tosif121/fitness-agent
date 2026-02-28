import logging

logger = logging.getLogger(__name__)

class RepCounterProcessor:
    def __init__(self, reps_per_set=10, rest_duration=60):
        self.reps_per_set = reps_per_set
        self.rest_duration = rest_duration
        self.reps = 0

    def __call__(self, frame, **kwargs):
        # A dummy processor that just passes the frame through
        return frame
