#pragma once

#include <cmath>
#include <vector>
#include <numeric>

namespace MathUtils {
    template<typename T>
    T sum(const std::vector<T>& values) {
        return std::accumulate(values.begin(), values.end(), static_cast<T>(0));
    }

    template<typename T>
    T average(const std::vector<T>& values) {
        if (values.empty()) return static_cast<T>(0);
        return sum(values) / static_cast<T>(values.size());
    }
} 