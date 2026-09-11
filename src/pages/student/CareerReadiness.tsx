import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useEnrolledCourseId } from "@/hooks/useEnrolledCourseId";
import { useCourseSoftSkills } from "@/hooks/useCourseSoftSkills";
import CareerReadinessSteps from "@/components/student/employment/CareerReadinessSteps";

/** Standalone Career Readiness page for employment-pathway students. */
const CareerReadiness = () => {
  const navigate = useNavigate();
  const courseId = useEnrolledCourseId();
  const { modules, loading } = useCourseSoftSkills(courseId, true);

  const goToStudy = (title: string) =>
    navigate(`/student/chat?newchat=true&mode=learning&concept=${encodeURIComponent(title)}&intent=start`);

  return (
    <div className="p-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-heading text-3xl font-bold">Career Readiness</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Understand what's coming, prepare your stories, then practice until you're interview-ready.
        </p>
      </motion.div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : modules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Your professor hasn't published career readiness modules yet.
          </CardContent>
        </Card>
      ) : (
        <CareerReadinessSteps modules={modules} onStudy={goToStudy} />
      )}
    </div>
  );
};

export default CareerReadiness;
