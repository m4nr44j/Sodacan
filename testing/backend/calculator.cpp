#include <iostream>
#include <vector>
#include <string>
#include "math_utils.h"

namespace Calculator {
    namespace Operations {
        
        template<typename T>
        class MathProcessor {
        private:
            std::vector<T> history;
            
        public:
            MathProcessor() = default;
            
            T add(T a, T b) {
                T result = a + b;
                history.push_back(result);
                return result;
            }
            
            T multiply(T a, T b) {
                T result = a * b;
                history.push_back(result);
                return result;
            }
            
            void clearHistory() {
                history.clear();
            }
            
            std::vector<T> getHistory() const {
                return history;
            }
        };
        
        struct Point {
            double x;
            double y;
            
            Point(double x = 0.0, double y = 0.0) : x(x), y(y) {}
        };
        
        class GeometryCalculator {
        public:
            static double distance(const Point& p1, const Point& p2) {
                double dx = p2.x - p1.x;
                double dy = p2.y - p1.y;
                return std::sqrt(dx * dx + dy * dy);
            }
            
            static double area(double radius) {
                const double PI = 3.14159265359;
                return PI * radius * radius;
            }
        };
    }
}

namespace Utils {
    void printBanner() {
        std::cout << "=== Advanced Calculator ===" << std::endl;
    }
    
    template<typename T>
    void printResult(const std::string& operation, T result) {
        std::cout << operation << " = " << result << std::endl;
    }
}

int main() {
    using namespace Calculator::Operations;
    
    Utils::printBanner();
    
    MathProcessor<double> processor;
    
    double sum = processor.add(10.5, 20.3);
    double product = processor.multiply(5.0, 4.0);
    
    Utils::printResult("Sum", sum);
    Utils::printResult("Product", product);
    
    Point p1(0, 0);
    Point p2(3, 4);
    double dist = GeometryCalculator::distance(p1, p2);
    
    Utils::printResult("Distance", dist);
    
    return 0;
} 